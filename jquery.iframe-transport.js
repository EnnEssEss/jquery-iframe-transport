// This [jQuery](http://jquery.com/) plugin implements an `<iframe>`
// [transport](http://api.jquery.com/extending-ajax/#Transports) so that
// `$.ajax()` calls support the uploading of files using standard HTML file
// input fields. This is done by switching the exchange from `XMLHttpRequest`
// to a hidden `iframe` element containing a form that is submitted.

// The [source for the plugin](http://github.com/cmlenz/jquery-iframe-transport)
// is available on [Github](http://github.com/) and dual licensed under the MIT
// or GPL Version 2 licenses.

// ## Usage

// To use this plugin, you simply add an `iframe` option with the value `true`
// to the Ajax settings an `$.ajax()` call, and specify the file fields to
// include in the submssion using the `files` option, which can be a selector,
// jQuery object, or a list of DOM elements containing one or more
// `<input type="file">` elements:

//      $("#myform").submit(function() {
//          $.ajax(this.action, {
//              files: $(":file", this),
//              iframe: true,
//              success: function(data) {
//                  console.log(data);
//              });
//      });

// The plugin will construct hidden `<iframe>` and `<form>` elements, add the
// file field(s) to that form, submit the form, and process the response.

// If you want to include other form fields in the form submission, include
// them in the `data` option

// ### Handling Server Errors

// Another problem with using an `iframe` for file uploads is that it is
// impossible for the javascript code to determine the HTTP status code of the
// servers response. Effectively, all of the calls you make will look like they
// are getting successful responses, and thus invoke the `done()` or
// `complete()` callbacks. You can only determine communication problems using
// the content of the response payload. For example, consider using a JSON
// response such as the following to indicate a problem with an uploaded file:

//     {"ok": false, "message": "Please only upload reasonably sized files."}

// ### Compatibility

// This plugin has primarily been tested on Safari 5 (or later), Firefox 4 (or
// later), and Internet Explorer (all the way back to version 6). While I
// haven't found any issues with it so far, I'm fairly sure it still doesn't
// work around all the quirks in all different browsers. But the code is still
// pretty simple overall, so you should be able to fix it and contribute a
// patch :)

// ## Annotated Source

(function($) {
    "use strict";

    // Register a prefilter that checks whether the `iframe` option is set, and
    // switches to the "iframe" data type if it is `true`.
    $.ajaxPrefilter(function(options, origOptions, jqXHR) {
        if (options.iframe) {
            options.dataType = 'iframe ' + options.dataType;
            options.processData = false;
            return 'iframe';
        }
    });

    // Register a transport for the "iframe" data type. It will only activate
    // when the "files" option has been set to a non-empty list of enabled file
    // inputs.
    $.ajaxTransport('iframe', function(options, origOptions, jqXHR) {
        var form = null,
            iframe = null,
            name = "iframe-" + $.now(),
            fileInputs = $(options.files).filter('input:file:enabled'),
            fileInputClones = null;

        // This function gets called after a successful submission or an abortion
        // and should revert all changes made to the page to enable the
        // submission via this transport.
        function cleanUp() {
            fileInputClones.replaceWith(function(index) {
                return fileInputs.get(index);
            });
            if (form) {
                form.remove();
            }
            if (iframe) {
                // We set the src in the iframe to abort the iframe's current request
                iframe.off('load')
                    .prop('src', 'javascript:false;')
                    .remove();
            }
        }

        if (fileInputs.length) {
            form = $("<form enctype='multipart/form-data' method='post'></form>")
                .hide()
                .attr({action: options.url, target: name});

            // If there is any additional data specified via the `data` option,
            // we add it as hidden fields to the form. This (currently) requires
            // the `processData` option to be set to false so that the data doesn't
            // get serialized to a string.
            if (typeof(options.data) === "string" && options.data.length > 0) {
                $.error("data must not be serialized");
            }
            $.each(options.data || {}, function(name, value) {
                if ($.isPlainObject(value)) {
                    name = value.name;
                    value = value.value;
                }
                $("<input type='hidden' />").attr({name:  name, value: value})
                    .appendTo(form);
            });

            // Add a hidden `X-Requested-With` field with the value `IFrame` to the
            // field, to help server-side code to determine that the upload happened
            // through this transport.
            $("<input type='hidden' value='IFrame' name='X-Requested-With' />")
                .appendTo(form);

            // Move the file fields into the hidden form, but first remember their
            // original locations in the document by replacing them with disabled
            // clones. This should also avoid introducing unwanted changes to the
            // page layout during submission.
            fileInputClones = fileInputs.clone()
                .prop('disabled', true);
            // Insert a clone for each file input field:
            fileInputs.after(function (index) {
                return fileInputClones[index];
            });

            fileInputs.appendTo(form);

            return {

                // The `send` function is called by jQuery when the request should be
                // sent.
                send: function(headers, completeCallback) {
                    iframe = $("<iframe src='javascript:false;' name='" + name +
                        "' id='" + name + "' style='display:none'></iframe>");

                    // The first load event gets fired after the iframe has been injected
                    // into the DOM, and is used to prepare the actual submission.
                    iframe.on("load", function() {

                        // The second load event gets fired when the response to the form
                        // submission is received. The implementation detects whether the
                        // actual payload is embedded in a `<textarea>` element, and
                        // prepares the required conversions to be made in that case.
                        iframe.off("load")
                            .on("load", function() {
                                var response;
                                // Wrap in a try/catch block to catch exceptions thrown
                                // when trying to access cross-domain iframe contents:
                                try {
                                    response = iframe.contents();
                                    // Google Chrome and Firefox do not throw an
                                    // exception when calling iframe.contents() on
                                    // cross-domain requests, so we unify the response:
                                    if (!response.length || !response[0].firstChild) {
                                        throw new Error();
                                    }
                                } catch (e) {
                                    response = undefined;
                                }
                                cleanUp();
                                completeCallback(
                                    200,
                                    'success',
                                    {iframe: response}
                                );
                            });

                        // Now that the load handler has been set up, submit the form.
                        form[0].submit();
                    });

                    // After everything has been set up correctly, the form and iframe
                    // get injected into the DOM so that the submission can be
                    // initiated.
                    $("body").append(form, iframe);
                },

                // The `abort` function is called by jQuery when the request should be
                // aborted.
                abort: function() {
                    if (iframe) {
                        cleanUp();
                    }
                }
            };
        }
    });

    // The iframe transport returns the iframe content document as response.
    // The following adds converters from iframe to text, json, html
    $.ajaxSetup({
        converters: {
            'iframe text': function (iframe) {
                return $(iframe[0].body).text();
            },
            'iframe json': function (iframe) {
                return $.parseJSON($(iframe[0].body).text());
            },
            'iframe html': function (iframe) {
                return $(iframe[0].body).html();
            }
        }
    });

}(jQuery));

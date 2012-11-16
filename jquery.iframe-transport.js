// This [jQuery](http://jquery.com/) plugin implements an `<iframe>`
// [transport](http://api.jquery.com/extending-ajax/#Transports) so that
// `$.ajax()` calls support the uploading of files using standard HTML file
// input fields. This is done by switching the exchange from `XMLHttpRequest`
// to a hidden `iframe` element containing a form that is submitted.

// The [source for the original plugin](http://github.com/cmlenz/jquery-iframe-transport)
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

// This plugin has primarily been tested on Firefox, IE7+

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
            iframe = null;

        // This function gets called after a successful submit or an abort
        function cleanUp() {
            if (form) {
                form.remove();
            }
            form = null;
            iframe = null;
        }

        if (options.async &&
            (options.type === 'POST' || options.type === 'GET' ||
            options.type === 'post' || options.type === 'get')
        ) {
            return {
                // The `send` function is called by jQuery when the request should be sent.
                send: function(headers, completeCallback) {
                    var iframeName = 'iframe-' + $.now();

                    iframe = $('<iframe src="javascript:false;" name="' + iframeName +
                        '" id="' + iframeName + '" style="display:none"></iframe>');
                    form = $('<form style="display:none;" enctype="multipart/form-data"></form>')
                        .prop('method', options.type)
                        .prop('action', options.url)
                        .prop('target', iframe.prop('name'));

                    // The first load event gets fired after the iframe has been injected
                    // into the DOM, and is used to prepare the actual submission.
                    iframe.on("load", function() {
                        var fileInputs = $(options.files).filter('input:file:enabled'),
                            fileInputClones;

                        // The second load event gets fired when the response to the form
                        // submission is received.
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

                        // Add a hidden `X-Requested-With` field with the value `IFrame` to the
                        // field, to help server-side code to determine that the upload happened
                        // through this transport.
                        $("<input type='hidden' value='IFrame' name='X-Requested-With' />")
                            .appendTo(form);

                        // Move the file fields into the hidden form, but first replace them
                        // with disabled clones.
                        fileInputClones = fileInputs.clone()
                            .prop('disabled', true);
                        // Insert a clone for each file input field:
                        fileInputs.after(function (index) {
                            return fileInputClones[index];
                        });
                        fileInputs.appendTo(form);

                        // If there is any additional data specified via the `data` option,
                        // we add it as hidden fields to the form.
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

                        // Submit the form
                        form.submit();

                        // Put the file inputs back
                        if (fileInputClones && fileInputClones.length) {
                            fileInputClones.replaceWith(function(index) {
                                return fileInputs.get(index);
                            });
                        }
                    });

                    // Add the form and the iframe to the body to kick off the first
                    // onload callback
                    form.append(iframe).appendTo($('body'));
                },

                // The `abort` function is called by jQuery when the request should be
                // aborted.
                abort: function() {
                    // We set the src in the iframe to abort the iframe's current request
                    if (iframe) {
                        iframe.off('load')
                            .prop('src', 'javascript:false;');
                    }
                    cleanUp();
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

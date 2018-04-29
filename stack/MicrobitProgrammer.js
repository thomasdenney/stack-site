'use strict';

/*jslint bitwise: true regexp: true*/

function MicrobitProgrammer() {

    var api = this;

    api.generateHexFile = function (code, brightness) {
        var contents = new Uint8Array(code.length);
        for (var i = 0; i < code.length; i++) {
            contents[i] = code[i];
        }
        return new Blob([contents], { type: "octet/stream" });
    };

    return api;

}
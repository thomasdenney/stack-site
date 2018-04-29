'use strict';

// Module dependencies

var fs = require('fs');
var vm = require('vm');

// Local dependencies

var includeInThisContext = function (path) {
    var code = fs.readFileSync(path);
    vm.runInThisContext(code, path);
}.bind(this);

includeInThisContext("../stack/Parser.js");
includeInThisContext("../stack/Scanner.js");
includeInThisContext("../stack/Compiler.js");
includeInThisContext("../stack/VirtualMachine.js");
includeInThisContext("../stack/MicrobitProgrammer.js");

// Define the sounder

function Sounder() {

    var api = this;

    api.tone = function (frequency) {
        console.log('Start tone with frequency ' + frequency);
    };

    api.beep = function (frequency, duration) {
        console.log('Start tone with frequency ' + frequency);
        setTimeout(function () {
            console.log('Stop tone after ' + duration + ' milliseconds');
        }, duration);
    };

    api.off = function() {
        console.log('Turn sounder off');
    }

    return api;

}

// Define the LED

function LED() {

    var api = this;

    api.flash = function (colour, duration) {
        console.log('Light LED with colour ' + colour);
        setTimeout(function () {
            console.log('Turn LED off after ' + duration + ' milliseconds');
        }, duration);
    };

    api.colour = function (colour) {
        console.log('Light LED with colour ' + colour);
    }

    api.rgb = function (red, green, blue) {
        console.log('Light LED with RGB colours [' + red + ', ' + blue + ', ' + green + ']');
    };

    api.off = function() {
        console.log('Turn LED off');
    }

    return api;

}

// Define the components

var led = new LED();
var sounder = new Sounder();

var parser = new Parser();
var scanner = new Scanner();
var compiler = new Compiler();
var virtualMachine = new VirtualMachine(sounder, led);

var microbitProgrammer = new MicrobitProgrammer();

// Connect up callbacks to the virtual machine

function formatAddress (value) {
    return "0x" + ("0000" + value.toString(16).toUpperCase()).substr(-4);
};

virtualMachine.on('statusUpdate', function (status) {

    var message;

    if (status === 0) {
        message = "RUN";
    } else if (status === 1) {
        message = "HALT";
    } else if (status === 2) {
        message = "INVALID ADDRESS";
    } else if (status === 3) {
        message = "INVALID INSTRUCTION";
    } else if (status === 4) {
        message = "INVALID OPERAND";
    } else if (status === 5) {
        message = "STACK OVERFLOW";
    } else if (status === 6) {
        message = "STACK UNDERFLOW";
    }

    console.log(message);

});

virtualMachine.on('finished', function () {
    console.log('Finished');
});

virtualMachine.on('decode', function (pc, mnemonic, argument) {
    argument = argument || '';
    console.log(formatAddress(pc) + ' : ' + mnemonic + '  ' + argument);
});

virtualMachine.on('returnStackUpdate', function (stack) {
    var i, addressStack = [];
    for (i = 0; i < stack.length; i += 1) {
        addressStack.push(formatAddress(stack[i]));
    }    console.log('Return stack : ' + JSON.stringify(addressStack));
});

virtualMachine.on('operandStackUpdate', function (stack) {
    console.log('Operand stack : ' + JSON.stringify(stack));
});

// Code entry point

var tokens = scanner.test();

var errors = parser.parse(tokens);

if (errors.length === 0) {

    compiler.compile(tokens);

    var formattedCode = compiler.getFormattedCode();

    console.log(formattedCode);

    //virtualMachine.load(compiler.getCode());

    //virtualMachine.run();

    fs.writeFileSync('STACK.hex', microbitProgrammer.generateHexFile([0x19, 0xC8, 0x00, 0x19, 0xF4, 0x01, 0x82, 0x02, 0x20]), {
        encoding: 'utf8'
    });

    //fs.writeFileSync('output.hex', microbitProgrammer.generateHexFile(compiler.getCode()), {
    //    encoding: 'utf8'
    //});

} else {

    console.log(errors);

}

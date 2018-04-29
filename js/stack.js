'use strict';

/*global $, QRious, CodeMirror, AudioContext, Scanner, Parser, Formatter, Compiler, VirtualMachine, MicrobitProgrammer, document, window, chrome*/
/*jslint bitwise: true */

$(function () {

    var MESSAGE_TYPE_CONNECT, MESSAGE_TYPE_DISCONNECT, MESSAGE_TYPE_RUN, MESSAGE_TYPE_PROGRAM, MESSAGE_TYPE_HALT, CHANGE_STRING,
        port, run, step, halt, newCode, machineCodeLineNumbers,
        operandStackSize, returnAddressStackSize, maxTotalStackSize,
        led, sounder,
        scanner, parser, compiler, formatter, virtualMachine, microbitProgrammer,
        brightnessLabels, brightnessSlider,
        loadButton, runButton, stepButton, haltButton, resetButton, microbitButton, uploadButton, iPhoneButton,
        programButton, runDeviceButton, haltDeviceButton,
        instruction, programCounter,
        syntaxBox,
        returnStack, operandStack,
        runtimeErrors,
        programSize, maximumStack,
        markedText, assemblyEditor, machineCodeViewer;

    CHANGE_STRING = 'format';

    MESSAGE_TYPE_CONNECT = 0;
    MESSAGE_TYPE_DISCONNECT = 1;
    MESSAGE_TYPE_PROGRAM = 2;
    MESSAGE_TYPE_RUN = 3;
    MESSAGE_TYPE_HALT = 4;

    run = false;
    step = false;
    halt = false;
    newCode = false;

    markedText = [];

    machineCodeLineNumbers = [];

    function Sounder(element) {

        var vca, vco, timer, audioContext, started, api = this;

        started = false;

        api.start = function () {
            if (!started) {
                audioContext = new AudioContext();

                vco = audioContext.createOscillator();
                vco.type = 'square';
                vco.frequency.value = 440;

                vca = audioContext.createGain();
                vca.gain.value = 0;

                vco.connect(vca);
                vca.connect(audioContext.destination);

                vco.start();

                started = true;
            }
        }

        api.tone = function (frequency) {
            if (started) {
                clearTimeout(timer);
                vco.frequency.setValueAtTime(frequency, audioContext.currentTime);
                vca.gain.setValueAtTime(1, audioContext.currentTime);
                element.text(frequency + ' Hz');
            }
        };

        api.off = function () {
            if (started) {
                clearTimeout(timer);
                vca.gain.setValueAtTime(0, audioContext.currentTime);
                element.text('----');
            }
        };

        api.beep = function (frequency, duration) {
            if (started) {
                vco.frequency.setValueAtTime(frequency, audioContext.currentTime);
                vca.gain.setValueAtTime(1, audioContext.currentTime);
                timer = setTimeout(api.off, duration);
                element.text(frequency + ' Hz');
            }
        };

        return api;

    }

    function LED(elements) {

        var timer, colours, api = this;

        colours = ['black', 'blue', 'green', 'cyan', 'red', 'magenta', 'yellow', 'white'];

        function rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }

        function setRGB(element, r, g, b) {
            element.css('fill', rgbToHex(r, g, b));
            element.css('stroke', rgbToHex(r, g, b));
            element.css('opacity', 1.0);
        }

        function setColour(element, colour) {
            element.css('fill', colour);
            element.css('stroke', colour);
            element.css('opacity', 1.0);
        }

        api.rgb = function (red, green, blue) {
            clearTimeout(timer);
            for (var i = 0; i < 9; i += 1) {
                setRGB(elements[i], red, green, blue);
            }
        };

        api.pixel = function (pixel, colour) {
            clearTimeout(timer);
            setColour(elements[pixel - 1], colours[colour]);
        };

        api.colour = function (colour) {
            clearTimeout(timer);
            for (var i = 0; i < 9; i += 1) {
                setColour(elements[i], colours[colour]);
            }
        };

        api.off = function () {
            clearTimeout(timer);
            for (var i = 0; i < 9; i += 1) {
                elements[i].css('fill', 'black');
                elements[i].css('stroke', 'black');
                elements[i].css('opacity', 0.5);
            }
        };

        api.flash = function (colour, duration) {
            for (var i = 0; i < 9; i += 1) {
                setColour(elements[i], colours[colour]);
            }
            timer = setTimeout(api.off, duration);
        };

        return api;

    }

    /* Define components */

    led = new LED([$('#led1'), $('#led2'), $('#led3'), $('#led4'), $('#led5'), $('#led6'), $('#led7'), $('#led8'), $('#led9')]);
    sounder = new Sounder($('#toneFrequency'));

    scanner = new Scanner();
    parser = new Parser();
    compiler = new Compiler();
    formatter = new Formatter();
    microbitProgrammer = new MicrobitProgrammer();
    virtualMachine = new VirtualMachine(sounder, led);

    loadButton = $('#loadButton').prop('disabled', true);
    runButton = $('#runButton').prop('disabled', true);
    stepButton = $('#stepButton').prop('disabled', true);
    haltButton = $('#haltButton').prop('disabled', true);
    resetButton = $('#resetButton').prop('disabled', true);

    programButton = $('#programButton').prop('disabled', true);
    runDeviceButton = $('#runDeviceButton').prop('disabled', true);
    haltDeviceButton = $('#haltDeviceButton').prop('disabled', true);

    brightnessLabels = ["Very Dim", "Dim", "Bright", "Very Bright"];

    brightnessSlider = $('#brightness').slider({
        formatter: function (value) {
            return brightnessLabels[value];
        }

    });

    iPhoneButton = $('#iPhoneButton').prop('disabled', true);
    microbitButton = $('#microbitButton').prop('disabled', true);
    uploadButton = $('#uploadButton').prop('disabled', true);

    if (/Mobi/.test(navigator.userAgent)) {

        microbitButton.hide();

    }

    instruction = $('#instruction');
    programCounter = $('#programCounter');

    syntaxBox = $('#syntaxBox');

    returnStack = $('#returnStack');
    operandStack = $('#operandStack');

    runtimeErrors = $('#runtimeErrors');

    programSize = $('#programSize');
    maximumStack = $('#maximumStack');

    function enable(element) {
        element.removeClass('disabled');
        element.prop('disabled', false);
    }

    function disable(element) {
        element.addClass('disabled');
        element.prop('disabled', true);
    }

    function configureButtonsForRunning() {
        disable(loadButton);
        disable(runButton);
        disable(stepButton);
        enable(haltButton);
        disable(resetButton);
    }

    function encodeBase64(input) {

        var i, keyStr, chr1, chr2, chr3, enc1, enc2, enc3, enc4, output = '';

        keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

        i = 0;

        while (i < input.length) {

            chr1 = input[i];
            i += 1;

            chr2 = input[i];
            i += 1;

            chr3 = input[i];
            i += 1;

            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;

            if (isNaN(chr2)) {
                enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
                enc4 = 64;
            }

            output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + keyStr.charAt(enc3) + keyStr.charAt(enc4);

        }

        return output;

    }

    runButton.click(function () {
        run = true;
        configureButtonsForRunning();
        virtualMachine.run();
    });

    stepButton.click(function () {
        step = true;
        configureButtonsForRunning();
        virtualMachine.step();
    });

    haltButton.click(function () {
        halt = true;
        disable(haltButton);
        virtualMachine.halt();
    });

    iPhoneButton.click(function () {

        var i, crc, code, data = [];

        crc = 0;

        code = compiler.getCode();

        for (i = 0; i < code.length; i += 1) {
            crc ^= code[i];
            data.push(code[i]);
        }

        data.push(crc);

        window.qr = new QRious({
            background: '#000',
            foreground: '#fff',
            level: 'H',
            padding: 25,
            size: 600,
            element: document.getElementById('qr'),
            value: encodeBase64(data)
        });

        $('#iPhoneModal').modal('show');

    });

    uploadButton.click(function () {

        var element, brightness, file;

        //brightness = brightnessSlider.slider('getValue');

        brightness = 3;

        file = microbitProgrammer.generateHexFile(compiler.getCode(), 3 - brightness);

        if (file) {
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/sendToMicrobit", true);
            xhr.onreadystatechange = function () {
                if (this.readyState == 4 && this.status == 200) {
                    console.log(this.responseText);
                }
                else {
                    console.log(this);
                }
            };
            xhr.send(file);
        }

    });

    function resetStackSizeMonitor() {
        operandStackSize = 0;
        returnAddressStackSize = 0;
        maxTotalStackSize = 0;
        maximumStack.text('');
    }

    function updateStackSizeMonitor() {
        maxTotalStackSize = Math.max(maxTotalStackSize, operandStackSize + returnAddressStackSize);
        maximumStack.text(maxTotalStackSize + ' words');
    }

    loadButton.click(function () {
        newCode = false;
        sounder.start();
        disable(loadButton);
        var code = compiler.getCode();
        virtualMachine.load(code);
    });

    resetButton.click(function () {
        disable(resetButton);
        virtualMachine.reset();
    });

    function resetButtonsAndInterface() {
        enable(runButton);
        enable(stepButton);
        disable(haltButton);
        disable(resetButton);
        runtimeErrors.css('color', '#011837');
        runtimeErrors.text('1 - HALT');
        resetStackSizeMonitor();
    }

    virtualMachine.on('reset', function () {
        resetButtonsAndInterface();
    });

    virtualMachine.on('load', function () {
        resetButtonsAndInterface();
    });

    function configureButtonsOnHalt() {

        if (newCode) {
            enable(loadButton);
        }

        enable(runButton);
        enable(stepButton);
        disable(haltButton);

        enable(resetButton);

    }

    function configureButtonsOnCompletion() {

        if (newCode) {
            enable(loadButton);
        }

        disable(runButton);
        disable(stepButton);
        disable(haltButton);

        enable(resetButton);

    }

    virtualMachine.on('statusUpdate', function (status) {

        var color, message;

        color = '#A00';
        message = '';

        if (status === 0) {
            if (step) {
                status = 1;
            } else {
                color = '#011837';
                message = "RUN";
            }
        }

        if (status === 1) {
            color = '#011837';
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

        runtimeErrors.css('color', color);
        runtimeErrors.text(status + ' - ' + message);

        if (status > 1) {

            run = false;
            step = false;

            configureButtonsOnCompletion();

        }

    });

    virtualMachine.on('finished', function () {

        run = false;
        step = false;

        if (halt) {

            configureButtonsOnHalt();

            runtimeErrors.text('1 - HALT');
            runtimeErrors.css('color', '#011837');


        } else {

            configureButtonsOnCompletion();

        }

        halt = false;

    });

    function formatAddress(value) {
        return "0x" + ("0000" + value.toString(16).toUpperCase()).substr(-4);
    }

    virtualMachine.on('decode', function (pc, mnemonic, argument) {

        if (step) {

            enable(runButton);
            enable(stepButton);
            enable(resetButton);
            disable(haltButton);

            step = false;

        }

        programCounter.html(formatAddress(pc));

        if (argument === undefined) {
            instruction.text(mnemonic);
        } else {
            instruction.text(mnemonic + '  ' + argument);
        }

    });

    function updateStack(element, address, stack) {

        var i, content = '';

        if (stack.length > 0) {
            for (i = stack.length - 1; i > 0; i -= 1) {
                if (address) {
                    content += formatAddress(stack[i]);
                } else {
                    content += stack[i];
                }
                content += '\n';
            }
            if (address) {
                content += formatAddress(stack[0]);
            } else {
                content += stack[0];
            }
        }

        element.text(content);

    }

    virtualMachine.on('returnStackUpdate', function (stack) {

        returnAddressStackSize = stack.length;

        updateStack(returnStack, true, stack);

        updateStackSizeMonitor();

    });

    virtualMachine.on('operandStackUpdate', function (stack) {

        operandStackSize = stack.length;

        updateStack(operandStack, false, stack);

        updateStackSizeMonitor();

    });

    assemblyEditor = new CodeMirror(document.getElementById('assemblyEditor'), {
        tabSize: 2,
        lineNumbers: true,
        smartIndent: false,
        lineWrapping: true
    });

    machineCodeViewer = new CodeMirror(document.getElementById('machineCodeViewer'), {
        lineNumbers: true,
        lineNumberFormatter: function (line) {
            if (line === 1 && machineCodeLineNumbers.length === 0) {
                return '0x0000';
            }
            if (line > machineCodeLineNumbers.length) {
                return '      ';
            }
            return machineCodeLineNumbers[line - 1];
        },
    });

    function resizeElements(frameHeight) {

        $('#assemblyEditor .CodeMirror').height(frameHeight - 80);
        $('#machineCodeViewer .CodeMirror').height(frameHeight - 115);
        $('#simulator').height(frameHeight - 82);

        $('#microbitPanel').height(260);
        $('#operandStackPanel').height(frameHeight - 498);
        $('#returnStackPanel').height(frameHeight - 498);

    }

    function resize() {

        var frameHeight = $(window).height() - 60;

        resizeElements(frameHeight);

    }

    if (fullscreen) {

        window.onresize = function (event) {
            resize();
        }

        resize();

    } else {

        $('#assemblyEditor .CodeMirror').height(600);
        $('#machineCodeViewer .CodeMirror').height(562);
        $('#simulator').height(600);

        $('#microbitPanel').height(260);
        $('#operandStackPanel').height(168);
        $('#returnStackPanel').height(168);

    }

    assemblyEditor.on('change', function (instance, changeObject) {

        var i, j, to, from, code, input, output, token, className, tokens, errors, change, changes, lastChange, codeLength, message = '';

        if (instance === undefined) {
            console.log("Editor instance is undefined");
        }

        if (changeObject.origin !== CHANGE_STRING) {

            /* Run the scanner over the editor content */

            input = assemblyEditor.getValue();
            tokens = scanner.scan(input);
            errors = parser.parse(tokens);

            /* Update code highlighting */

            for (i = 0; i < markedText.length; i += 1) {

                markedText[i].clear();

            }

            markedText = [];

            for (i = 0; i < tokens.length; i += 1) {

                token = tokens[i];

                className = null;

                switch (token.type) {
                    case 'CODE_SEGMENT':
                    case 'DATA_SEGMENT':
                        className = 'cm-code-data';
                        break;
                    case 'LABEL':
                        if (token.error) {
                            className = 'cm-error';
                        } else if (token.matched) {
                            className = 'cm-label-matched';
                        } else {
                            className = 'cm-label';
                        }
                        break;
                    case 'ADDRESS':
                        if (token.matched) {
                            className = 'cm-label-matched';
                        }
                        break;
                    case 'INSTRUCTION':
                    case 'JUMP_INSTRUCTION':
                        className = 'cm-instruction';
                        break;
                    case 'COLOUR':
                        className = 'cm-colour';
                        break;
                    case 'NUMBER':
                        if (token.error) {
                            className = 'cm-error';
                        }
                        break;
                }

                if (className) {

                    from = {
                        line: token.line,
                        ch: token.column
                    };

                    to = {
                        line: token.line,
                        ch: token.column + token.length
                    };

                    markedText.push(assemblyEditor.markText(from, to, {
                        className: className
                    }));

                }

            }

            /* Parse editor changes */

            lastChange = '';

            if (changeObject.origin === '+input' && changeObject.text.length === 2 && changeObject.text[0] === '' && changeObject.text[1] === '') {

                lastChange = formatter.NEWLINE;

            } else if (changeObject.origin === '+delete') {

                if (changeObject.removed.length > 1) {

                    lastChange = formatter.DELETE_NEWLINE;

                } else {

                    lastChange = formatter.DELETE_CHARACTERS;

                }

            }

            changes = formatter.format(assemblyEditor.getCursor(), lastChange, tokens);

            for (i = 0; i < changes.length; i += 1) {

                change = changes[i];

                assemblyEditor.replaceRange(change.text, change.start, change.end, CHANGE_STRING);

            }

            /* Parse errors */

            if (errors.length > 0) {

                syntaxBox.addClass('alert-danger');
                syntaxBox.removeClass('alert-success');

                for (i = 0; i < Math.min(errors.length - 1, 5); i += 1) {
                    message += 'Line ' + (errors[i][0] + 1) + ': ' + errors[i][1] + '\n';
                }

                message += 'Line ' + (errors[errors.length - 1][0] + 1) + ': ' + errors[errors.length - 1][1];

                syntaxBox.text(message);

            } else {

                syntaxBox.removeClass('alert-danger');
                syntaxBox.addClass('alert-success');

                syntaxBox.text('Compiled successfully.');

                compiler.compile(tokens);

                output = '';

                code = compiler.getFormattedCode();

                machineCodeLineNumbers = [];

                for (i = 0; i < code.length; i += 1) {
                    machineCodeLineNumbers.push(code[i][0]);
                    for (j = 1; j < code[i].length; j += 1) {
                        output += code[i][j];
                        if (j != code[i].length - 1) {
                            output += " "
                        } else if (i != code.length - 1) {
                            output += "\n"
                        }
                    }
                }

                machineCodeViewer.setValue(output);

                codeLength = compiler.getCode().length;

                if (codeLength === 1) {

                    programSize.text('1 byte');

                } else {

                    programSize.text(codeLength + ' bytes');

                }

                newCode = true;

                if (!run) {
                    enable(loadButton);
                }

                enable(iPhoneButton);
                enable(microbitButton);
                enable(uploadButton);
            }

        }

    });

    assemblyEditor.setValue(scanner.testCode);

    if (window.chrome !== undefined) {

        $('#usbText').html("USB device disconnected");

        port = chrome.runtime.connect('fpehmcopjclhdnoklmdlimbpndddcnci');

        if (port) {

            programButton.click(function () {
                disable(programButton);
                disable(runDeviceButton);
                disable(haltDeviceButton);
                port.postMessage({
                    type: MESSAGE_TYPE_PROGRAM,
                    code: compiler.getCode()
                });
            });

            runDeviceButton.click(function () {
                disable(programButton);
                disable(runDeviceButton);
                disable(haltDeviceButton);
                port.postMessage({
                    type: MESSAGE_TYPE_RUN
                });
            });

            haltDeviceButton.click(function () {
                disable(programButton);
                disable(runDeviceButton);
                disable(haltDeviceButton);
                port.postMessage({
                    type: MESSAGE_TYPE_HALT
                });
            });

            port.onMessage.addListener(function (message) {

                switch (message.type) {

                    case MESSAGE_TYPE_CONNECT:

                        enable(programButton);
                        enable(runDeviceButton);
                        enable(haltDeviceButton);

                        $('#usbText').html("USB device connected");

                        break;

                    case MESSAGE_TYPE_DISCONNECT:

                        disable(programButton);
                        disable(runDeviceButton);
                        disable(haltDeviceButton);

                        $('#usbText').html("USB device disconnected");

                        break;

                    case MESSAGE_TYPE_RUN:

                        if (!message.contents) {

                            $('#usbText').css('color', 'darkred');
                            $('#usbText').html("Error launching device");

                            setTimeout(function () {
                                $('#usbText').css('color', 'darkgrey');
                                $('#usbText').html("USB device connected");
                                enable(programButton);
                                enable(runDeviceButton);
                                enable(haltDeviceButton);
                            }, 1000);

                        } else {

                            enable(programButton);
                            enable(runDeviceButton);
                            enable(haltDeviceButton);

                        }

                        break;

                    case MESSAGE_TYPE_PROGRAM:

                        if (!message.contents) {

                            $('#usbText').css('color', 'darkred');
                            $('#usbText').html("Error programming device");

                            setTimeout(function () {
                                $('#usbText').css('color', 'darkgrey');
                                $('#usbText').html("USB device connected");
                                enable(programButton);
                                enable(runDeviceButton);
                                enable(haltDeviceButton);
                            }, 1000);

                        } else {

                            enable(programButton);
                            enable(runDeviceButton);
                            enable(haltDeviceButton);

                        }

                        break;

                    case MESSAGE_TYPE_HALT:

                        if (!message.contents) {

                            $('#usbText').css('color', 'darkred');
                            $('#usbText').html("Error halting device");

                            setTimeout(function () {
                                $('#usbText').css('color', 'darkgrey');
                                $('#usbText').html("USB device connected");
                                enable(programButton);
                                enable(runDeviceButton);
                                enable(haltDeviceButton);
                            }, 1000);

                        } else {

                            enable(programButton);
                            enable(runDeviceButton);
                            enable(haltDeviceButton);

                        }

                        break;

                }

            });

        } else {

            $('#usbText').html("Extension not available");

        }

    }

});
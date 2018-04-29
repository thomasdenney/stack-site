'use strict';

/*jslint bitwise: true, unparam: true*/

function VirtualMachine(sounder, led) {

    var OPTIONAL, INT8_MAX, INT16_MAX, INT32_MIN, INT32_MAX,
        halt, timer, timerFunction, currentInstruction,
        returnStack, operandStack, programStore,
        optionalInstructions, standardInstructions,
        callCounter, statusType, eventHandler, API = this;

    INT8_MAX = 0x7F;
    INT16_MAX = 0x7FFF;
    INT32_MAX = 0x7FFFFFFF;
    INT32_MIN = -(INT32_MAX + 1);

    /* Initialise the call counter */

    callCounter = 0;

    /* Define error types */

    statusType = {
        RUN: 0,
        HALT: 1,
        INVALID_ADDRESS: 2,
        INVALID_INSTRUCTION: 3,
        INVALID_OPERAND: 4,
        STACK_OVERFLOW: 5,
        STACK_UNDERFLOW: 6,
    };

    /* Stack functions */

    function Stack() {

        var checkStackLimit, stack, api = this;

        stack = [];

        checkStackLimit = function () {
            if (stack.length === 100) {
                throw statusType.STACK_OVERFLOW;
            }
        };

        api.duplicate = function (n) {
            if (n > stack.length) {
                throw statusType.STACK_UNDERFLOW;
            }
            checkStackLimit();
            stack.push(stack[stack.length - n]);
        };

        api.rotate = function (n) {
            var value;
            if (Math.abs(n) > stack.length) {
                throw statusType.STACK_UNDERFLOW;
            }
            if (n > 1) {
                value = stack[stack.length - n];
                stack.splice(stack.length - n, 1);
                stack.push(value);
            } else if (n < 1) {
                value = stack[stack.length - 1];
                stack.splice(stack.length + n, 0, value);
                stack.splice(stack.length - 1, 1);
            }
        };

        api.pop = function () {
            if (stack.length === 0) {
                throw statusType.STACK_UNDERFLOW;
            }
            var x = stack[stack.length - 1];
            stack.splice(stack.length - 1, 1);
            return x;
        };

        api.push = function (x) {
            checkStackLimit();
            stack.push(x);
        };

        api.reset = function () {
            stack = [];
        };

        api.size = function () {
            return stack.length;
        };

        api.copy = function () {
            return stack.slice(0);
        };

        return api;

    }

    /* Program functions */

    function ProgramStore() {

        var pc, program, api = this;

        pc = 0;
        program = [];

        api.readAddress = function (addr) {
            if (addr < 0 || addr >= program.length) {
                throw statusType.INVALID_ADDRESS;
            }
            return program[addr];
        };

        api.readAndIncrement = function () {
            var instruction = program[pc];
            pc += 1;
            return instruction;
        };

        api.jump = function (addr) {
            if (addr < 0 || addr >= program.length) {
                throw statusType.INVALID_ADDRESS;
            }
            pc = addr;
        };

        api.relativeJump = function (offset) {
            var addr = pc + offset;
            if (addr < 0 || addr > program.length) {
                throw statusType.INVALID_ADDRESS;
            }
            pc = addr;
        };

        api.programCounter = function () {
            return pc;
        };

        api.reset = function () {
            pc = 0;
        };

        api.load = function (p) {
            var i;
            program.splice(0, program.length);
            for (i = 0; i < p.length; i += 1) {
                program.push(p[i]);
            }
            pc = 0;
        };

        return api;

    }

    /* Standard instruction functions */

    function makeStandardInstructions() {

        /* Maths functions */

        function saturate(x) {
            return Math.min(INT32_MAX, Math.max(INT32_MIN, x));
        }

        function divide(x, y) {
            if (y === 0) {
                throw statusType.INVALID_OPERAND;
            }
            return Math.floor(x / y);
        }

        function modulus(x, y) {
            if (y < 1) {
                throw statusType.INVALID_OPERAND;
            }
            return x % y;
        }

        function convertToSigned8Bit(low, high) {
            var val = low;
            if (val > INT8_MAX) {
                val = (val - 0xFF) - 1;
            }
            return val;
        }

        function convertToSigned16Bit(low, high) {
            var val = 256 * high + low;
            if (val > INT16_MAX) {
                val = (val - 0xFFFF) - 1;
            }
            return val;
        }

        function getSingleByteArgument(programStore) {
            var low = programStore.readAndIncrement();
            return convertToSigned8Bit(low);
        }

        function getDoubleByteArgument(programStore) {
            var low, high;
            low = programStore.readAndIncrement();
            high = programStore.readAndIncrement();
            return convertToSigned16Bit(low, high);
        }

        /* Return object */

        return {

            0x00: {
                mnemonic: 'ADD',
                execute: function (operandStack) {
                    // a b ADD ( ab -- x ) where x = a + b
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(saturate(a + b));
                }
            },
            0x01: {
                mnemonic: 'SUB',
                execute: function (operandStack) {
                    // a b SUB ( ab -- x ) where x = a - b
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(saturate(a - b));
                }
            },
            0x02: {
                mnemonic: 'MUL',
                execute: function (operandStack) {
                    // a b MUL ( ab -- x ) where x = a * b
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(saturate(a * b));
                }
            },
            0x03: {
                mnemonic: 'DIV',
                execute: function (operandStack) {
                    // a b DIV ( ab -- x ) where x = a / b
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(saturate(divide(a, b)));
                }
            },
            0x04: {
                mnemonic: 'MOD',
                execute: function (operandStack) {
                    // a b MOD ( ab -- x ) where x = a % b
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(saturate(modulus(a, b)));
                }
            },
            0x05: {
                mnemonic: 'INC',
                execute: function (operandStack) {
                    // a INC ( a -- x ) where x = a + 1
                    var a = operandStack.pop();
                    operandStack.push(saturate(a + 1));
                }
            },
            0x06: {
                mnemonic: 'DEC',
                execute: function (operandStack) {
                    // a DEC ( a -- x ) where x = a - 1
                    var a = operandStack.pop();
                    operandStack.push(saturate(a - 1));
                }
            },
            0x07: {
                mnemonic: 'MAX',
                execute: function (operandStack) {
                    // ab MAX ( ab -- x ) where x = max(a,b)
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(Math.max(a, b));
                }
            },
            0x08: {
                mnemonic: 'MIN',
                execute: function (operandStack) {
                    // ab MAX ( ab -- x ) where x = min(a,b)
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(Math.min(a, b));
                }
            },
            0x09: {
                mnemonic: 'LT',
                execute: function (operandStack) {
                    // ab LT ( ab -- x ) where x = a < b ? 1 : 0
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(a < b ? 1 : 0);
                }
            },
            0x0A: {
                mnemonic: 'LE',
                execute: function (operandStack) {
                    // ab LE ( ab -- x ) where x = a <= b ? 1 : 0
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(a <= b ? 1 : 0);
                }
            },
            0x0B: {
                mnemonic: 'EQ',
                execute: function (operandStack) {
                    // ab EQ ( ab -- x ) where x = a == b ? 1 : 0
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(a === b ? 1 : 0);
                }
            },
            0x0C: {
                mnemonic: 'GE',
                execute: function (operandStack) {
                    // ab GE ( ab -- x ) where x = a >= b ? 1 : 0
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(a >= b ? 1 : 0);
                }
            },
            0x0D: {
                mnemonic: 'GT',
                execute: function (operandStack) {
                    // ab GT ( ab -- x ) where x = a > b ? 1 : 0
                    var a, b;
                    b = operandStack.pop();
                    a = operandStack.pop();
                    operandStack.push(a > b ? 1 : 0);
                }
            },
            0x0E: {
                mnemonic: 'DROP',
                execute: function (operandStack) {
                    // DROP ( a -- )
                    operandStack.pop();
                }
            },
            0x0F: {
                mnemonic: 'DUP',
                execute: function (operandStack) {
                    // DUP ( a -- aa )
                    operandStack.duplicate(1);
                }
            },
            0x10: {
                mnemonic: 'NDUP',
                execute: function (operandStack) {
                    // n DUP ( abc -- abcb ) n = 2
                    var n = operandStack.pop();
                    if (n < 1) {
                        throw statusType.INVALID_OPERAND;
                    }
                    operandStack.duplicate(n);
                }
            },
            0x11: {
                mnemonic: 'SWAP',
                execute: function (operandStack) {
                    // SWAP ( ab -- ba )
                    operandStack.rotate(2);
                }
            },
            0x12: {
                mnemonic: 'ROT',
                execute: function (operandStack) {
                    // ROT ( abc -- bca )
                    operandStack.rotate(3);
                }
            },
            0x13: {
                mnemonic: 'NROT',
                execute: function (operandStack) {
                    // n NROT ( abcd -- bcda ) n = 4
                    var n = operandStack.pop();
                    if (n < 1) {
                        throw statusType.INVALID_OPERAND;
                    }
                    operandStack.rotate(n);
                }
            },
            0x14: {
                mnemonic: 'TUCK',
                execute: function (operandStack) {
                    // TUCK ( abc -- cab )
                    operandStack.rotate(-3);
                }
            },
            0x15: {
                mnemonic: 'NTUCK',
                execute: function (operandStack) {
                    // n NROT ( abcd -- dabc ) n = 4
                    var n = operandStack.pop();
                    if (n < 1) {
                        throw statusType.INVALID_OPERAND;
                    }
                    operandStack.rotate(-n);
                }
            },
            0x16: {
                mnemonic: 'SIZE',
                execute: function (operandStack) {
                    // SIZE ( -- x )
                    operandStack.push(operandStack.size());
                }
            },
            0x17: {
                mnemonic: 'NRND',
                execute: function (operandStack) {
                    // n RND ( n -- x )
                    var n = operandStack.pop();
                    if (n < 2) {
                        throw statusType.INVALID_OPERAND;
                    }
                    operandStack.push(Math.floor(n * Math.random()));
                }
            },
            0x18: {
                mnemonic: 'PUSH',
                decode: function (programStore) {
                    return getSingleByteArgument(programStore);
                },
                execute: function (operandStack, programStore, returnStack, argument) {
                    // PUSH x ( -- x )
                    operandStack.push(argument);
                }
            },
            0x19: {
                mnemonic: 'PUSH',
                decode: function (programStore) {
                    return getDoubleByteArgument(programStore);
                },
                execute: function (operandStack, programStore, returnStack, argument) {
                    // PUSH x ( -- x )
                    operandStack.push(argument);
                }
            },
            0x1A: {
                mnemonic: 'FETCH',
                execute: function (operandStack, programStore) {
                    // addr FETCH ( a -- x )
                    var low, high, addr = operandStack.pop();
                    low = programStore.readAddress(addr);
                    high = programStore.readAddress(addr + 1);
                    operandStack.push(convertToSigned16Bit(low, high));
                }
            },
            0x1B: {
                mnemonic: 'CALL',
                execute: function (operandStack, programStore, returnStack) {
                    // addr CALL ( -- )
                    var addr = operandStack.pop();
                    returnStack.push(programStore.programCounter());
                    programStore.jump(addr);
                }
            },
            0x1C: {
                mnemonic: 'RET',
                execute: function (operandStack, programStore, returnStack) {
                    // RET ( -- )
                    var addr = returnStack.pop();
                    programStore.jump(addr);
                }
            },
            0x1D: {
                mnemonic: 'JMP',
                execute: function (operandStack, programStore, returnStack) {
                    // addr JMP ( a -- )
                    var addr = operandStack.pop();
                    programStore.jump(addr);
                }
            },
            0x1E: {
                mnemonic: 'CJMP',
                execute: function (operandStack, programStore, returnStack) {
                    // a addr CJMP  ( ab -- )
                    var a, addr;
                    addr = operandStack.pop();
                    a = operandStack.pop();
                    if (a !== 0) {
                        programStore.jump(addr);
                    }
                }
            },
            0x1F: {
                mnemonic: 'WAIT'
            },
            0x20: {
                mnemonic: 'HALT',
            }

        };

    }

    /* Optional instruction functions */

    function makeOptionalInstructions() {

        function tone() {
            // frequency TONE ( f -- )
            var frequency = operandStack.pop();
            if (frequency < 0 || frequency > INT16_MAX) {
                throw statusType.INVALID_OPERAND;
            }
            if (frequency === 0) {
                sounder.off();
            } else {
                sounder.tone(frequency);
            }
        }

        function colour() {
            // colour COLOUR ( c -- )
            var col = operandStack.pop();
            if (col < 0 || col > 7) {
                throw statusType.INVALID_OPERAND;
            }
            led.colour(col);
        }

        return {

            0x80: {
                mnemonic: 'SLEEP',
                execute: function (operandStack, programStore, returnStack) {
                    operandStack.reset();
                    returnStack.reset();
                }
            },
            0x81: {
                mnemonic: 'TONE',
                execute: tone
            },
            0x82: {
                mnemonic: 'BEEP',
                execute: tone
            },
            0x83: {
                mnemonic: 'RGB',
                execute: function (operandStack) {
                    // red green blue RGB ( rgb -- )
                    var red, green, blue;
                    blue = operandStack.pop();
                    green = operandStack.pop();
                    red = operandStack.pop();
                    if (red < 0 || green < 0 || blue < 0 || red > 255 || green > 255 || blue > 255) {
                        throw statusType.INVALID_OPERAND;
                    }
                    led.rgb(red, green, blue);
                }
            },
            0x84: {
                mnemonic: 'COLOUR',
                execute: colour
            },
            0x85: {
                mnemonic: 'FLASH',
                execute: colour
            },
            0x86: {
                mnemonic: 'TEMP',
                execute: function (operandStack) {
                     // TEMP ( -- t )
                    operandStack.push(20);
                }
            },
            0x87: {
                mnemonic: 'ACCEL',
                execute: function (operandStack) {
                    // ACCEL ( -- xyz )
                    operandStack.push(0);
                    operandStack.push(0);
                    operandStack.push(1024);
                }
            },
            0x88: {
                mnemonic: 'PIXEL',
                execute: function (operandStack) {
                    // colour pixel PIXEL ( cp -- )
                    var col, pixel;
                    pixel = operandStack.pop();
                    col = operandStack.pop();
                    if (col < 0 || col > 7 || pixel < 1 || pixel > 9) {
                        throw statusType.INVALID_OPERAND;
                    }
                    led.pixel(pixel, col);
                }
            }

        };

    }

    /* Create handler lists */

    eventHandler = {
        load: function () {
            return;
        },
        reset: function () {
            return;
        },
        statusUpdate: function () {
            return;
        },
        decode: function () {
            return;
        },
        finished: function () {
            return;
        },
        returnStackUpdate: function () {
            return;
        },
        operandStackUpdate: function () {
            return;
        },
    };

    function registerEvent(handler) {

        var args = arguments;

        if (handler) {
            setTimeout(handler, 0, args[1], args[2], args[3]);
        }

    }

    /* Define instruction codes */

    OPTIONAL = 0x80;

    /* Make the virtual machine components */

    programStore = new ProgramStore();

    returnStack = new Stack();

    operandStack = new Stack();

    optionalInstructions = makeOptionalInstructions();
    standardInstructions = makeStandardInstructions();

    function executeUnsupportedInstruction(operandStack, programStore, returnStack, argument) {

        var n, i, stackInstruction = programStore.readAndIncrement();

        // Remove values from the stack

        n = stackInstruction & 0x000F;

        for (i = 0; i < n; i += 1) {
            operandStack.pop();
        }

        // Insert dummy values to the stack

        n = (stackInstruction & 0x00F0) >> 4;

        for (i = 0; i < n; i += 1) {
            operandStack.push(0);
        }

    }

    function format8BitHexadecimal(value) {
        if (value < 0) {
            value += 0xFF + 1;
        }
        return "0x" + ("00" + value.toString(16).toUpperCase()).substr(-2);
    }

    function format16BitHexadecimal(value) {
        if (value < 0) {
            value += 0xFFFF + 1;
        }
        return "0x" + ("0000" + value.toString(16).toUpperCase()).substr(-4);
    }

    function decode() {

        var pc, opcode, instruction, formattedArgument;

        currentInstruction = {};

        try {

            pc = programStore.programCounter();

            opcode = programStore.readAndIncrement();

            currentInstruction.opcode = opcode;

            if (opcode < OPTIONAL) {

                /* Standard instructions */

                instruction = standardInstructions[opcode];

                if (instruction) {

                    if (instruction.decode) {

                        currentInstruction.argument = instruction.decode(programStore);

                    }

                    currentInstruction.execute = instruction.execute;

                    currentInstruction.mnemonic = instruction.mnemonic;

                } else {

                    throw statusType.INVALID_INSTRUCTION;

                }

            } else {

                instruction = optionalInstructions[opcode];

                if (instruction) {

                    currentInstruction.mnemonic = instruction.mnemonic;

                    currentInstruction.execute = instruction.execute;

                } else {

                    currentInstruction.mnemonic = 'DUMMY';

                    currentInstruction.execute = executeUnsupportedInstruction;

                }

            }

            if (currentInstruction.mnemonic === 'PUSH') {

                if (currentInstruction.opcode === 0x18) {

                    formattedArgument = format8BitHexadecimal(currentInstruction.argument) + ' (' + currentInstruction.argument + ')';

                } else {

                    formattedArgument = format16BitHexadecimal(currentInstruction.argument) + ' (' + currentInstruction.argument + ')';

                }

            } else {

                formattedArgument = '';

            }

            registerEvent(eventHandler.decode, pc, currentInstruction.mnemonic, formattedArgument);

        } catch (error) {

            registerEvent(eventHandler.statusUpdate, error);

        }

    }

    function step(freeRunning) {

        var mnemonic, duration = 0;

        function turnOffSounderThenStep(freeRunning) {
            decode();
            sounder.off();
            if (freeRunning) {
                step(freeRunning);
            }
        }

        function turnOffLedThenStep(freeRunning) {
            decode();
            led.off();
            if (freeRunning) {
                step(freeRunning);
            }
        }

        if (halt) {
            
            sounder.off();

            registerEvent(eventHandler.finished);

            halt = false;

            return;

        }

        try {

            mnemonic = currentInstruction.mnemonic;

            if (currentInstruction.execute) {

                if (mnemonic === 'BEEP' || mnemonic === 'FLASH') {

                    duration = operandStack.pop();

                    if (duration < 0 || duration > INT16_MAX) {
                        throw statusType.INVALID_OPERAND;
                    }

                }

                currentInstruction.execute(operandStack, programStore, returnStack, currentInstruction.argument);

                registerEvent(eventHandler.returnStackUpdate, returnStack.copy());

                registerEvent(eventHandler.operandStackUpdate, operandStack.copy());

            }

            if (currentInstruction.opcode >= OPTIONAL) {

                programStore.readAndIncrement();

            }

            if (mnemonic === 'WAIT') {

                duration = operandStack.pop();

                registerEvent(eventHandler.operandStackUpdate, operandStack.copy());

                if (duration < 0 || duration > INT16_MAX) {
                    throw statusType.INVALID_OPERAND;
                }

            }

            if (mnemonic === 'HALT' || mnemonic === 'SLEEP') {

                led.off();

                sounder.off();

                registerEvent(eventHandler.statusUpdate, statusType.HALT);

                registerEvent(eventHandler.finished);


            } else {

                if (mnemonic === 'BEEP') {

                    timerFunction = function() {
                        turnOffSounderThenStep(freeRunning);
                    };

                    timer = setTimeout(timerFunction, duration);

                } else if (mnemonic === 'FLASH') {

                    timerFunction = function() {
                        turnOffLedThenStep(freeRunning);
                    };

                    timer = setTimeout(timerFunction, duration);

                } else {

                    if (freeRunning) {

                        if (duration > 0) {

                            timerFunction = function() {

                                decode();
                                
                                step(true);

                            };

                            timer = setTimeout(timerFunction, duration);

                        } else {

                            decode();

                            /* setTimeout has a minimum delay in browsers which is too
                            long for rapid running. Browsers also have a maximum
                            recursion depth of about 10,000 calls. We keep count of
                            how many recursive calls we have made and put in a setTimeout
                            call when we reach 1000 calls.*/

                            callCounter += 1;

                            if (callCounter > 1000) {

                                callCounter = 0;

                                timerFunction = function() {
                                    step(true);
                                };

                                timer = setTimeout(timerFunction, 0);

                            } else {

                                step(true);

                            }

                        }

                    } else {

                        if (duration > 0) {

                            timerFunction = function() {

                                decode();

                            };

                            timer = setTimeout(timerFunction, duration);

                        } else {

                            decode();

                        }

                    }

                }

            }

        } catch (error) {

            registerEvent(eventHandler.statusUpdate, error);

        }

    }

    function reset() {
        clearTimeout(timer);
        returnStack.reset();
        programStore.reset();
        operandStack.reset();
        led.off();
        sounder.off();
        decode();
    }

    API.load = function (code) {
        programStore.load(code);
        reset();
        registerEvent(eventHandler.load);
        registerEvent(eventHandler.returnStackUpdate, returnStack.copy());
        registerEvent(eventHandler.operandStackUpdate, operandStack.copy());
    };

    API.run = function () {
        halt = false;
        registerEvent(eventHandler.statusUpdate, statusType.RUN);
        step(true);
    };

    API.step = function () {
        registerEvent(eventHandler.statusUpdate, statusType.RUN);
        step(false);
    };

    API.halt = function () {
        halt = true;
        clearTimeout(timer);
        timer = setTimeout(timerFunction, 0);
    };

    API.reset = function () {
        reset();
        registerEvent(eventHandler.reset);
        registerEvent(eventHandler.returnStackUpdate, returnStack.copy());
        registerEvent(eventHandler.operandStackUpdate, operandStack.copy());
    };

    API.on = function (event, action) {
        var handler = eventHandler[event];
        if (handler) {
            eventHandler[event] = action;
        } else {
            throw "Unabled to attach event handler within VirtualMachine.";
        }
    };

    return API;

}
'use strict';

function Compiler() {

    var code, formattedCode, instructionSet, api = this;

    instructionSet = {

        ADD: 0x00,
        SUB: 0x01,
        MUL: 0x02,
        DIV: 0x03,
        MOD: 0x04,
        INC: 0x05,
        DEC: 0x06,
        MAX: 0x07,
        MIN: 0x08,
        LT: 0x09,
        LE: 0x0a,
        EQ: 0x0b,
        GE: 0x0c,
        GT: 0x0d,
        DROP: 0x0e,
        DUP: 0x0f,
        NDUP: 0x10,
        SWAP: 0x11,
        ROT: 0x12,
        NROT: 0x13,
        TUCK: 0x14,
        NTUCK: 0x15,
        SIZE: 0x16,
        NRND: 0x17,
        PUSH8: 0x18,
        PUSH16: 0x19,
        FETCH: 0x1a,
        CALL: 0x1b,
        RET: 0x1c,
        JMP: 0x1d,
        CJMP: 0x1e,
        WAIT: 0x1f,
        HALT: 0x20,

        SLEEP: [0x80, 0x01],
        TONE: [0x81, 0x01],
        BEEP: [0x82, 0x02],
        RGB: [0x83, 0x03],
        COLOUR: [0x84, 0x01],
        FLASH: [0x85, 0x02],
        TEMP: [0x86, 0x10],
        ACCEL: [0x87, 0x30],
        PIXEL: [0x88, 0x02]

    };

    function convertToSigned8Bit(value) {

        if (value < 0) {
            value = 0xFF + value + 1;
        }

        return {
            low: value
        };

    }

    function convertToSigned16Bit(value) {

        var low, high;

        if (value < 0) {
            value = 0xFFFF + value + 1;
        }

        high = Math.floor(value / 256);
        low = value - 256 * high;

        return {
            high: high,
            low: low
        };

    }

    function formatByteWithoutLeader(value) {
        return ("00" + value.toString(16).toUpperCase()).substr(-2);
    }

    function formatAddress(value) {
        return "0x" + ("0000" + value.toString(16).toUpperCase()).substr(-4);
    }

    api.getCode = function () {
        return code;
    };

    api.getFormattedCode = function () {
        return formattedCode;
    };

    api.compile = function (tokens) {

        var i, j, row, index, value, label, labels, labelByte, address, addresses, opcodeBlock, inDataBlock, inOpcodeBlock, byteGroups, token;

        code = [];

        labels = {};

        addresses = [];

        byteGroups = [];

        inDataBlock = false;

        inOpcodeBlock = false;

        /* Process tokens in first pass handling all non-data insructions */

        for (i = 0; i < tokens.length; i += 1) {

            token = tokens[i];

            if (token.type === 'DATA_SEGMENT') {

                /* Now inside the data block */

                inDataBlock = true;

            } else if (token.type === 'CODE_SEGMENT') {

                /* Finished processing the data block */

                inDataBlock = false;

                /* Remember the code position of this label */

                labels.code = code.length;

            } else if (token.type === 'RAW_OPCODE_START') {

                /* Create new empty list to store opcodes */

                if (!inOpcodeBlock) {

                    opcodeBlock = [];

                }

                inOpcodeBlock += true;

            } else if (token.type === 'RAW_OPCODE_END') {

                /* Add opcodes in the closed opcode block */

                if (opcodeBlock.length > 0) {

                    byteGroups.push(opcodeBlock.length);

                    for (j = 0; j < opcodeBlock.length; j += 1) {

                        code.push(opcodeBlock[j]);

                    }

                }

                inOpcodeBlock = false;

            } else if (token.type === 'LABEL' && !inDataBlock) {

                /* Remember the code position of this label */

                labels[token.value] = code.length;

            } else if (token.type === 'ADDRESS' && !inDataBlock) {

                /* Keep track of the number of bytes in this instruction */

                byteGroups.push(3);

                /* Add the push instruction */

                code.push(instructionSet.PUSH16);

                /* Note the address where the actual address will go */

                addresses.push({
                    label: token.value,
                    byte: code.length,
                    inDataBlock: false,
                    byteGroupsIndex: byteGroups.length - 1
                });

                /* Write dummy values to be filled in later */

                code.push(0x00);
                code.push(0x00);

            } else if (inOpcodeBlock && token.type === 'NUMBER_HEX_BYTE') {

                /* Convert this number to signed 8 bit */

                value = convertToSigned8Bit(token.value);

                /* Add to current opcode block */

                opcodeBlock.push(value.low);

            } else if ((token.type === 'NUMBER_DECIMAL' || token.type === 'NUMBER_HEX_BYTE' || token.type === 'NUMBER_HEX_TWO_BYTE' || token.type === 'COLOUR') && !inDataBlock) {

                if (token.value > 127 || token.value < -128) {

                    /* Convert this number to signed 16 bit */

                    value = convertToSigned16Bit(token.value);

                    /* Keep track of the number of bytes in this instruction */

                    byteGroups.push(3);

                    /* Add the push instruction and the bytes to the code */

                    code.push(instructionSet.PUSH16);
                    code.push(value.low);
                    code.push(value.high);

                } else {

                    /* Convert this number to signed 8 bit */

                    value = convertToSigned8Bit(token.value);

                    /* Keep track of the number of bytes in this instruction */

                    byteGroups.push(2);

                    /* Add the push instruction and the bytes to the code */

                    code.push(instructionSet.PUSH8);
                    code.push(value.low);

                }

            } else if (token.type === 'INSTRUCTION') {

                /* Get the opcode for this instruction */

                value = instructionSet[token.value];

                /* Check if there are multiple bytes for this instruction */

                if (Array.isArray(value)) {

                    /* Keep track of the number of bytes in this instruction */

                    byteGroups.push(value.length);

                    /* Push each instruction byte to the code */

                    for (j = 0; j < value.length; j += 1) {

                        code.push(value[j]);

                    }

                } else {

                    /* Keep track of the number of bytes in this instruction */

                    byteGroups.push(1);

                    /* Push the instruction byte to the code */

                    code.push(value);

                }

            } else if (token.type === 'JUMP_INSTRUCTION') {

                /* Get the opcode for this instruction */

                value = instructionSet[token.value];

                /* Keep track of the number of bytes in this instruction */

                byteGroups.push(1);

                /* Add the instruction to the code */

                code.push(value);

            }

        }

        /* Add HALT is last instruction wasn't RET, HALT or JMP */

        j = tokens.length - 1;

        while (j >= 0 && (tokens[j].type === 'WHITESPACE' || tokens[j].type === 'NEWLINE')) {
            j -= 1;
        }

        if (j === -1 || (tokens[j].value !== 'RET' && tokens[j].value !== 'HALT' && tokens[j].value !== 'JMP')) {

            /* If the last instruction was not RET, HALT or JMP then add a HALT */

            byteGroups.push(1);

            code.push(instructionSet.HALT);

        }

        /* Process tokens in second pass handling the data block */

        inDataBlock = false;

        for (i = 0; i < tokens.length; i += 1) {

            token = tokens[i];

            if (token.type === 'DATA_SEGMENT') {

                /* Now inside the data block */

                inDataBlock = true;

                /* Remember the code position of this label */

                labels.data = code.length;

            } else if (token.type === 'CODE_SEGMENT') {

                /* Finished processing the data block */

                inDataBlock = false;

            } else if (token.type === 'LABEL' && inDataBlock) {

                /* Remember the code position of this label */

                labels[token.value] = code.length;

            } else if (token.type === 'ADDRESS' && inDataBlock) {

                /* Keep track of the number of bytes in this instruction */

                byteGroups.push(2);

                /* Note the address where the actual address will go */

                addresses.push({
                    label: token.value,
                    byte: code.length,
                    inDataBlock: true
                });

                /* Write dummy values to be filled in later */

                code.push(0x00);
                code.push(0x00);

            } else if ((token.type === 'NUMBER_DECIMAL' || token.type === 'NUMBER_HEX_BYTE' || token.type === 'NUMBER_HEX_TWO_BYTE' || token.type === 'COLOUR') && inDataBlock) {

                /* Convert this number to signed 16 bit */

                value = convertToSigned16Bit(token.value);

                /* Keep track of the number of bytes in this value */

                byteGroups.push(2);

                /* Add the values to the code */

                code.push(value.low);
                code.push(value.high);

            }

        }

        /* Resolve the labels and addresses in the code */

        for (i = 0; i < addresses.length; i += 1) {

            address = addresses[i];

            labelByte = labels[address.label];

            if (labelByte < 128 && address.inDataBlock === false) {

                /* Check if this is a three byte PUSH instruction */

                if (byteGroups[address.byteGroupsIndex] === 3) {

                    /* Remove the extra byte */

                    code.splice(address.byte, 1);

                    code[address.byte - 1] = 0x18;

                    byteGroups[address.byteGroupsIndex] = 2;

                    /* Shift all addresses and labels after this point in the code down by one byte */

                    for (label in labels) {

                        if (labels.hasOwnProperty(label)) {

                            if (labels[label] > address.byte) {

                                labels[label] -= 1;

                            }

                        }

                    }

                    for (j = i + 1; j < addresses.length; j += 1) {

                        if (addresses[j].byte > address.byte) {

                            addresses[j].byte -= 1;

                        }

                    }

                    /* Read updated position of the label */

                    labelByte = labels[address.label];

                    /* Update index in order to start again */

                    i = -1;

                }

                value = convertToSigned8Bit(labelByte);

                code[address.byte] = value.low;

            } else {

                value = convertToSigned16Bit(labelByte);

                code[address.byte] = value.low;
                code[address.byte + 1] = value.high;

            }

        }

        /* Generate formatted listing */

        index = 0;

        formattedCode = [];

        for (i = 0; i < byteGroups.length; i += 1) {

            row = [];

            row.push(formatAddress(index));

            for (j = 0; j < byteGroups[i]; j += 1) {

                row.push(formatByteWithoutLeader(code[index]));

                index += 1;

            }

            formattedCode.push(row);

        }

    };

    return api;

}
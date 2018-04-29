'use strict';

function Parser() {

    var api = this;

    api.parse = function (tokens) {

        var i, j, errors, token, addresses, labels, labelNames, foundLabel, inDataBlock, inOpcodeBlock, opcodeBlockErrorGenerated, seenNumber, seenAddress, seenInstruction, missingLabels, repeatedLabels, INT16_MAX, INT16_MIN;

        INT16_MAX = 0x7fff;
        INT16_MIN = -(INT16_MAX + 1);

        /* Generate list of addresses and labels */

        labels = [];
        addresses = [];
        labelNames = [];

        missingLabels = [];
        repeatedLabels = [];

        for (i = 0; i < tokens.length; i += 1) {

            token = tokens[i];

            if (token.type === 'DATA_SEGMENT' || token.type === 'CODE_SEGMENT' || token.type === 'LABEL') {

                if (labelNames.indexOf(token.value) === -1) {

                    token.matched = false;

                    labels.push(token);
                    labelNames.push(token.value);

                } else {

                    repeatedLabels.push(token);

                }

            }

            if (token.type === 'ADDRESS') {

                token.matched = false;

                addresses.push(token);

            }

        }

        /* Check for matching addresses */

        for (i = 0; i < addresses.length; i += 1) {

            foundLabel = false;

            for (j = 0; j < labels.length; j += 1) {

                if (addresses[i].value === labels[j].value) {

                    foundLabel = true;

                    labels[j].matched = true;
                    addresses[i].matched = true;

                }

            }

            if (foundLabel === false) {

                missingLabels.push(addresses[i]);

            }

        }

        /* Function to generate error messages */

        errors = [];

        function addError(token, message) {

            token.error = true;

            errors.push([token.line, message]);

        }

        /* Check the raw opcode use and generate warning message */

        inDataBlock = false;
        inOpcodeBlock = false;
        opcodeBlockErrorGenerated = false;

        i = 0;

        while (i < tokens.length && !opcodeBlockErrorGenerated) {

            token = tokens[i];

            if (token.type === 'RAW_OPCODE_START') {

                if (inDataBlock) {

                    addError(token, "Opcode blocks may not be in the data segment.");

                    opcodeBlockErrorGenerated = true;

                } else if (inOpcodeBlock) {

                    addError(token, "Opcode blocks may not be nested.");

                    opcodeBlockErrorGenerated = true;

                }

                inOpcodeBlock = true;

            } else if (token.type === 'RAW_OPCODE_END') {

                if (inDataBlock) {

                    addError(token, "Opcode blocks may not be in the data segment.");

                    opcodeBlockErrorGenerated = true;

                } else if (!inOpcodeBlock) {

                    addError(token, "Opcode block closed but not opened.");

                    opcodeBlockErrorGenerated = true;

                }

                inOpcodeBlock = false;

            } else if (token.type === 'DATA_SEGMENT') {

                inDataBlock = true;

            } else if (token.type === 'CODE_SEGMENT') {

                inDataBlock = false;

            }

            i += 1;

        }

        if (inOpcodeBlock && !opcodeBlockErrorGenerated) {

            addError(token, "Opcode block opened but not closed.");

            opcodeBlockErrorGenerated = true;

        }

        /* Check contents of opcode block */

        i = 0;

        inOpcodeBlock = false;

        while (i < tokens.length && !opcodeBlockErrorGenerated) {

            token = tokens[i];

            if (token.type === 'RAW_OPCODE_START') {

                inOpcodeBlock = true;

            } else if (token.type === 'RAW_OPCODE_END') {

                inOpcodeBlock = false;

            } else if (token.type !== 'WHITESPACE' && token.type !== 'NEWLINE' && token.type !== 'LABEL' && token.type !== 'UNRECOGNISED' && token.type !== 'NUMBER_HEX_BYTE') {

                if (inOpcodeBlock) {

                    addError(token, "Only opcodes may be in the opcode block.");

                    opcodeBlockErrorGenerated = true;

                }

            }

            i += 1;

        }

        /* Check the syntax and generate warning message */

        seenNumber = false;
        seenAddress = false;
        seenInstruction = false;

        inDataBlock = false;

        for (i = 0; i < tokens.length; i += 1) {

            token = tokens[i];

            if (token.type === 'DATA_SEGMENT') {

                inDataBlock = true;

            } else if (token.type === 'CODE_SEGMENT') {

                inDataBlock = false;

                if (seenInstruction === true || seenNumber === true || seenAddress) {

                    addError(token, "No instructions may proceed the code segment.");

                }

            } else if (token.type === 'NUMBER_DECIMAL' || token.type === 'NUMBER_HEX_BYTE' || token.type === 'NUMBER_HEX_TWO_BYTE' || token.type === 'COLOUR') {

                if (token.value > INT16_MAX || token.value < INT16_MIN) {

                    addError(token, 'The number ' + token.value + ' is out of range.');

                }

                if (inDataBlock === false) {

                    seenNumber = true;

                }

            } else if (token.type === 'ADDRESS') {

                if (inDataBlock === false) {

                    seenAddress = true;

                }

            } else if (token.type !== 'WHITESPACE' && token.type !== 'NEWLINE' && token.type !== 'LABEL' && token.type !== 'UNRECOGNISED' && token.type !== 'RAW_OPCODE_START' && token.type !== 'RAW_OPCODE_END') {

                if (inDataBlock === true) {

                    addError(token, "Instructions may not appear in the data segment.");

                } else {

                    seenInstruction = true;

                }

            }

            if (token.type === 'UNRECOGNISED') {

                addError(token, "Unrecognised lexeme '" + token.lexeme + "'.");

            }

        }

        /* Add warnings about repeated labels */

        for (i = 0; i < repeatedLabels.length; i += 1) {

            addError(repeatedLabels[i], "The label '" + repeatedLabels[i].value + "' appears more than once.");

        }

        /* Add warnings about missing labels */

        for (i = 0; i < missingLabels.length; i += 1) {

            addError(missingLabels[i], "Could not match '" + missingLabels[i].value + "' against any known label.");

        }

        return errors;

    };

    return api;

}
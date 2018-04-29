'use strict';

function Scanner() {

    var rules, colours, characterType, getCharacterType, api = this;

    characterType = {
        BACKSLASH_R: 1,
        BACKSLASH_N: 2,
        RAW_OPCODE_START: 3,
        RAW_OPCODE_END: 4,
        W: 5,
        NW: 6
    };

    colours = {
        black: 0,
        blue: 1,
        green: 2,
        cyan: 3,
        red: 4,
        magenta: 5,
        yellow: 6,
        white: 7
    };

    rules = [
        function (lexeme) {
            if (/^\n$|^\r\n$/i.test(lexeme)) {
                return {
                    type: 'NEWLINE',
                    value: lexeme.length
                };
            }
        },
        function (lexeme) {
            if (/^[\s\t\r]+$/i.test(lexeme)) {
                return {
                    type: 'WHITESPACE',
                    value: lexeme.length
                };
            }
        },
        function (lexeme) {
            if (/^\[$/i.test(lexeme)) {
                return {
                    type: 'RAW_OPCODE_START',
                    value: lexeme.length
                };
            }
        },
        function (lexeme) {
            if (/^\]$/i.test(lexeme)) {
                return {
                    type: 'RAW_OPCODE_END',
                    value: lexeme.length
                };
            }
        },
        function (lexeme) {
            if (/^[\-+]?[0-9]+$/i.test(lexeme)) {
                return {
                    type: 'NUMBER_DECIMAL',
                    value: parseInt(lexeme, 10)
                };
            }
        },
        function (lexeme) {
            if (/^0x[0-9a-fA-F][0-9a-fA-F]$/i.test(lexeme)) {
                var value = parseInt(lexeme, 16);
                if (value > 0x7F) {
                    value = (value - 0xFF) - 1;
                }
                return {
                    type: 'NUMBER_HEX_BYTE',
                    value: value
                };
            }
        },
        function (lexeme) {
            if (/^0x[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]$/i.test(lexeme)) {
                var value = parseInt(lexeme, 16);
                if (value > 0x7FFF) {
                    value = (value - 0xFFFF) - 1;
                }
                return {
                    type: 'NUMBER_HEX_TWO_BYTE',
                    value: value
                };
            }
        },
        function (lexeme) {
            if (lexeme.match(/^\.code$/)) {
                return {
                    type: 'CODE_SEGMENT',
                    value: lexeme.slice(1, lexeme.length)
                };
            }
        },
        function (lexeme) {
            if (lexeme.match(/^\.data$/)) {
                return {
                    type: 'DATA_SEGMENT',
                    value: lexeme.slice(1, lexeme.length)
                };
            }
        },
        function (lexeme) {
            if (/^[a-zA-Z][0-9a-zA-Z_]*\:$/.test(lexeme)) {
                return {
                    type: 'LABEL',
                    value: lexeme.slice(0, lexeme.length - 1)
                };
            }
        },
        function (lexeme) {
            if (/^\+$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'ADD'
                };
            }
        },
        function (lexeme) {
            if (/^\-$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'SUB'
                };
            }
        },
        function (lexeme) {
            if (/^\*$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'MUL'
                };
            }
        },
        function (lexeme) {
            if (/^\/$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'DIV'
                };
            }
        },
        function (lexeme) {
            if (/^%$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'MOD'
                };
            }
        },
        function (lexeme) {
            if (/^<$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'LT'
                };
            }
        },
        function (lexeme) {
            if (/^<=$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'LE'
                };
            }
        },
        function (lexeme) {
            if (/^=$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'EQ'
                };
            }
        },
        function (lexeme) {
            if (/^>=$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'GE'
                };
            }
        },
        function (lexeme) {
            if (/^>$/.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: 'GT'
                };
            }
        },
        function (lexeme) {
            if (/^black$|^red$|^blue$|^green$|^yellow$|^magenta$|^cyan$|^white$/i.test(lexeme)) {
                return {
                    type: 'COLOUR',
                    value: colours[lexeme.toLowerCase()]
                };
            }
        },
        function (lexeme) {
            if (/^NOP$|^ADD$|^SUB$|^MUL$|^DIV$|^MOD$|^INC$|^DEC$|^MAX$|^MIN$|^LT$|^LE$|^EQ$|^GE$|^GT$|^DROP$|^DUP$|^NDUP$|^SWAP$|^ROT$|^NROT$|^TUCK$|^NTUCK$|^SIZE$|^NRND$|^FETCH$|^RET$|^HALT$|^WAIT$|^SLEEP$|^BEEP$|^TONE$|^RGB$|^COLOUR$|^FLASH$|^TEMP$|^ACCEL$|^PIXEL$/i.test(lexeme)) {
                return {
                    type: 'INSTRUCTION',
                    value: lexeme.toUpperCase()
                };
            }
        },
        function (lexeme) {
            if (/^CALL$|^JMP$|^CJMP$/i.test(lexeme)) {
                return {
                    type: 'JUMP_INSTRUCTION',
                    value: lexeme.toUpperCase()
                };
            }
        },
        function (lexeme) {
            if (/^[a-zA-Z][0-9a-zA-Z_]*$/.test(lexeme)) {
                return {
                    type: 'ADDRESS',
                    value: lexeme
                };
            }
        },
        function () {
            return {
                type: 'UNRECOGNISED'
            };
        }
    ];

    getCharacterType = function (character) {

        if ((/^\r$/).test(character)) {
            return characterType.BACKSLASH_R;
        }

        if ((/^\n$/).test(character)) {
            return characterType.BACKSLASH_N;
        }

        if ((/^\[$/).test(character)) {
            return characterType.RAW_OPCODE_START;
        }

        if ((/^\]$/).test(character)) {
            return characterType.RAW_OPCODE_END;
        }

        if ((/^[\t\s]$/).test(character)) {
            return characterType.W;
        }

        return characterType.NW;

    };

    api.scan = function (inputString) {

        var i, startIndex, endIndex, line, column,
            startingCharacter, startingCharacterType,
            currentCharacter, currentCharacterType,
            lexeme, match, token, tokens = [];

        line = 0;
        column = 0;
        startIndex = 0;

        while (startIndex < inputString.length) {

            startingCharacter = inputString.charAt(startIndex);

            startingCharacterType = getCharacterType(startingCharacter);

            endIndex = startIndex + 1;

            while (endIndex < inputString.length) {

                currentCharacter = inputString.charAt(endIndex);

                currentCharacterType = getCharacterType(currentCharacter);

                if (startingCharacterType === characterType.BACKSLASH_N || startingCharacterType === characterType.RAW_OPCODE_START || startingCharacterType === characterType.RAW_OPCODE_END) {

                    break;

                }

                if (startingCharacterType === characterType.BACKSLASH_R && currentCharacterType === characterType.BACKSLASH_N) {

                    endIndex += 1;

                    break;

                }

                if (currentCharacterType !== startingCharacterType) {

                    break;

                }

                endIndex += 1;

            }

            lexeme = inputString.substring(startIndex, endIndex);

            /* Initialise the next token given the starting point */

            token = {
                line: line,
                column: column,
                offset: startIndex
            };

            /* Test lexeme against the rules */

            for (i = 0; i < rules.length; i += 1) {

                match = rules[i](lexeme);

                if (match !== undefined) {
                    break;
                }

            }

            /* Update token parameters given the match */

            token.type = match.type;
            token.value = match.value;

            token.lexeme = lexeme;
            token.length = endIndex - startIndex;

            /* Push token to the final list */

            tokens.push(token);

            /* Increment for the next token */

            if (token.type === 'NEWLINE') {

                line += 1;
                column = 0;

            } else {

                column += token.length;

            }

            startIndex = endIndex;

        }

        return tokens;

    };

    api.testCode = '.data\n  494 523 587 659 699 740 784\n.code\n  33 6 1\nloop:\n  dup rot + 7 mod\n  dup inc colour\n  dup play call\n  rot dec dup 4 ntuck\n  0 > loop cjmp\n  halt\nplay:\n  2 * data + fetch\n  200 beep\n  50 wait\n  ret\n';

    api.test = function () {

        return api.scan(api.testCode);

    };

}
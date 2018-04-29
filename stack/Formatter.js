'use strict';

function Formatter() {

    var DELETE_CHARACTERS, DELETE_NEWLINE, NEWLINE, NO_SPACE, SINGLE_SPACE, INDENT_SPACE, REPLACE, INSERT_BEFORE_TOKEN, INSERT_AT_START_OF_LINE, api = this;

    NO_SPACE = '';
    SINGLE_SPACE = ' ';
    INDENT_SPACE = '  ';

    NEWLINE = 'NEWLINE';
    DELETE_NEWLINE = 'DELETE_NEWLINE';
    DELETE_CHARACTERS = 'DELETE_CHARACTERS';

    REPLACE = 'REPLACE';
    INSERT_BEFORE_TOKEN = 'INSERT_BEFORE_TOKEN';
    INSERT_AT_START_OF_LINE = 'INSERT_AT_START_OF_LINE';


    function isLabel(token) {

        if (token.type === 'CODE_SEGMENT' || token.type === 'DATA_SEGMENT' || token.type === 'LABEL') {

            return true;

        }

        return false;

    }

    function isWhiteSpace(token) {

        return token.type === 'WHITESPACE';

    }

    function isNewLine(token) {

        return token.type === 'NEWLINE';

    }

    function isOpcodeBlockStart(token) {

        return token.type === 'RAW_OPCODE_START';

    }

    function isOpcodeBlockEnd(token) {

        return token.type === 'RAW_OPCODE_END';

    }

    function cursorIsAtStartOfLine(cursorPosition) {

        return cursorPosition.ch === 0;
    }

    function isLineAboveCursor(cursorPosition, token) {

        if (cursorPosition.line === token.line + 1) {

            return true;

        }

        return false;

    }

    function isNotSameLineAsCursor(cursorPosition, token) {

        if (cursorPosition.line !== token.line) {

            return true;

        }

        return false;

    }

    function isNotAdjacentToCursor(cursorPosition, token) {

        if (cursorPosition.line !== token.line) {

            return true;

        }

        if (cursorPosition.ch < token.column || cursorPosition.ch > token.column + token.value) {

            return true;

        }

        return false;

    }

    function makeChangeObject(type, replacementString, token, offset) {

        var change = {};

        if (offset === undefined) {
            offset = 0;
        }

        change.text = replacementString;

        if (type === REPLACE) {

            change.start = {
                line: token.line,
                ch: token.column
            };

            change.end = {
                line: token.line,
                ch: token.column + token.value
            };

        } else if (type === INSERT_BEFORE_TOKEN) {

            change.start = {
                line: token.line,
                ch: token.column
            };

            change.end = change.start;

        } else if (type === INSERT_AT_START_OF_LINE) {

            change.start = {
                line: token.line + offset,
                ch: 0
            };

            change.end = change.start;
        }

        return change;

    }

    api.format = function (cursorPosition, lastChange, tokens) {

        var i, token, nextToken, nextNextToken, enableIndentation, changes = [];

        /* Check for indentation */

        i = 0;

        enableIndentation = false;

        while (i < tokens.length) {

            while (i < tokens.length && isWhiteSpace(tokens[i])) {
                i += 1;
            }

            if (i < tokens.length && isLabel(tokens[i])) {
                enableIndentation = true;
                break;
            }

            while (i < tokens.length && !isNewLine(tokens[i])) {
                i += 1;
            }

            i += 1;

        }

        /* Make edits to correct indentation */

        for (i = tokens.length - 1; i >= -1; i -= 1) {

            token = tokens[i];
            nextToken = tokens[i + 1];
            nextNextToken = tokens[i + 2];

            /* Remove spaces from end of lines */

            if (token && isWhiteSpace(token)) {

                if (isNotSameLineAsCursor(cursorPosition, token)) {

                    if (!nextToken || (nextToken && isNewLine(nextToken))) {

                        changes.push(makeChangeObject(REPLACE, NO_SPACE, token));

                    }

                }

            }

            /* Ensure single space between instructions or no space between opcode block brackets */

            if (token && !isNewLine(token) && !isWhiteSpace(token)) {

                if (nextToken && isWhiteSpace(nextToken) && isNotSameLineAsCursor(cursorPosition, token)) {

                    if (nextNextToken && !isNewLine(nextNextToken) && nextToken.value !== 1) {

                        if (isOpcodeBlockStart(token) || isOpcodeBlockEnd(nextNextToken)) {

                            changes.push(makeChangeObject(REPLACE, NO_SPACE, nextToken));

                        } else {

                            changes.push(makeChangeObject(REPLACE, SINGLE_SPACE, nextToken));

                        }

                    }

                } else if (nextToken && isOpcodeBlockStart(nextToken)) {

                    if (isNotSameLineAsCursor(cursorPosition, token)) {

                        changes.push(makeChangeObject(INSERT_BEFORE_TOKEN, SINGLE_SPACE, nextToken));

                    }

                } else if (isOpcodeBlockEnd(token) && nextToken && !isWhiteSpace(nextToken)) {

                    if (isNotSameLineAsCursor(cursorPosition, token)) {

                        changes.push(makeChangeObject(INSERT_BEFORE_TOKEN, SINGLE_SPACE, nextToken));

                    }

                }

            }

            /* Fix indentation of lines */

            if (i === -1 || isNewLine(token)) {

                if (enableIndentation) {

                    if (nextToken) {

                        if (isNewLine(nextToken)) {

                            if (lastChange === NEWLINE) {

                                /* Insert indent into empty line after newline */

                                changes.push(makeChangeObject(INSERT_AT_START_OF_LINE, INDENT_SPACE, token, 1));

                            }

                        } else if (isWhiteSpace(nextToken)) {

                            if (nextNextToken) {

                                if (isLabel(nextNextToken)) {

                                    if (lastChange === NEWLINE || lastChange === DELETE_NEWLINE || (lastChange !== NEWLINE && isNotAdjacentToCursor(cursorPosition, nextToken))) {

                                        /* Remove indentation if label is next */

                                        changes.push(makeChangeObject(REPLACE, NO_SPACE, nextToken));

                                    }

                                } else {

                                    if (nextToken.value !== INDENT_SPACE.length && isNotAdjacentToCursor(cursorPosition, nextToken)) {

                                        /* Adjust indentation to two spaces if not a label */

                                        changes.push(makeChangeObject(REPLACE, INDENT_SPACE, nextToken));

                                    }

                                }

                            }

                        } else if (!isLabel(nextToken)) {

                            if (!(lastChange === DELETE_CHARACTERS && cursorIsAtStartOfLine(cursorPosition))) {

                                /* Insert indentation unless cursor is at start of line after deletion */

                                changes.push(makeChangeObject(INSERT_AT_START_OF_LINE, INDENT_SPACE, nextToken));

                            }

                        }

                    } else {

                        if (lastChange === NEWLINE && isLineAboveCursor(cursorPosition, token)) {

                            /* Insert indentation on last line if new line created */

                            changes.push(makeChangeObject(INSERT_AT_START_OF_LINE, INDENT_SPACE, token, 1));

                        }

                    }

                } else {

                    /* Remove spaces at the start of each line, unless cursor is there */

                    if (nextToken && isWhiteSpace(nextToken)) {

                        if (isNotAdjacentToCursor(cursorPosition, nextToken)) {

                            changes.push(makeChangeObject(REPLACE, NO_SPACE, nextToken));

                        }

                    }

                }

            }

        }

        return changes;

    };

    api.DELETE_CHARACTERS = DELETE_CHARACTERS;
    api.DELETE_NEWLINE = DELETE_NEWLINE;
    api.NEWLINE = NEWLINE;

    return api;

}
#!/usr/bin/env python3

import http.server
import os
import re
import serial
import socketserver
import struct
import urllib

PORT = 8003
SERIAL_PORT_NAME = ""

if SERIAL_PORT_NAME == "":
    devices = os.listdir("/dev/")
    pattern = re.compile(r"^cu\.usbmodem")
    matches = [x for x in devices if pattern.match(x)]
    if len(matches) > 0:
        SERIAL_PORT_NAME = os.path.join("/dev/", matches[0])
    else:
        print("No device found, please specify a device")
        exit()

try:
    ser = serial.Serial(SERIAL_PORT_NAME, baudrate=115200)
except:
    ser = None

def byte_string(bs):
    return ":".join("{:02x}".format(x) for x in bs)


def send(ser, data, name):
    n = ser.write(data)
    ser.flush()
    print("[SEND {}]\t{} ({}/{} bytes)".format(name,
                                               byte_string(data), n, len(data)))


def send_length(ser, length):
    # < is little endian
    # H is unsigned short
    to_send = struct.pack("<H", length)
    send(ser, to_send, "LENGTH")


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        path = urllib.parse.urlsplit(self.path)
        print(path)
        if path.path == "/sendToMicrobit":
            contents = self.rfile.read(int(self.headers["Content-Length"]))
            send_length(ser, len(contents))
            send(ser, contents, "PROGRAM")
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Sent to micro:bit\n")
        else:
            self.send_error(404, "Unknown POST path")


httpd = socketserver.TCPServer(("", PORT), Handler)

print("serving at port {}".format(PORT))
httpd.serve_forever()

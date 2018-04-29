# Stack website

This is an adapted version of Alex Roger's [Stack][] website that supports
directly using my [MicroJIT][] JIT compiler on the BBC micro:bit.

[Stack]: http://www.cs.ox.ac.uk/people/alex.rogers/stack/
[microjit]: https://github.com/thomasdenney/microjit

*Please note that the server has only been tested on macOS 10.13* To run the
server, execute `./server.py` and navigate to `localhost:8003`. Click `Download
JIT` and copy the file to your micro:bit (alternatively follow the instructions
in the [MicroJIT][] repository to build the JIT compiler from source). Once your
micro:bit has rebooted, click `Send to micro:bit` to deploy Stack programs
directly to your micro:bit.

## License

&copy; Alex Rogers and Thomas Denney &copy; 2018.

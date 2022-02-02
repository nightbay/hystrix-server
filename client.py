import socket

TARGET = '/tmp/app.hystrix'

BUFFER_SIZE = 1024
MESSAGE = "Hello, World!"

s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(TARGET)
s.send(MESSAGE)
s.close()


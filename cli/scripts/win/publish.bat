@echo off
call docker build --platform linux/amd64 -t tripolskypetr/backtest-kit . -f Dockerfile
call docker push tripolskypetr/backtest-kit:latest

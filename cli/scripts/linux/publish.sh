#!/bin/bash
docker build --platform linux/amd64 -t tripolskypetr/backtest-kit . -f Dockerfile
docker push tripolskypetr/backtest-kit:latest

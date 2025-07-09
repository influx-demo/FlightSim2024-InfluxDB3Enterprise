@echo off
title InfluxDB Server

powershell -ExecutionPolicy Bypass -File "%~dp0\powershell\1-start-influxdb.ps1"

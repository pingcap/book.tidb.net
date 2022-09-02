---
title: Critical bug - TiFlash 在开启 Profiling 以后偶发崩溃 - TiDB 社区技术月刊
sidebar_label: TiFlash 在开启 Profiling 以后偶发崩溃
hide_title: true
description: 本文介绍如何解决 TiFlash 在开启 Profiling 以后偶发崩溃后的情况。
keywords: [TiFlash, Profiling, TiDB,  errno, pprof-rs]
---

# [Critical bug] TiFlash 在开启 Profiling 以后偶发崩溃

> 作者：Yexiang Zhang

## Issue

TiFlash 在运行中偶尔出现某些系统调用（诸如 `write()`）返回非法的 errno，由于程序无法处理非法 errno，所以最终会导致进程崩溃。由于仅在开启 Profiling 期间复现出该问题，因此怀疑与 Profiling 相关。

Github issue: https://github.com/pingcap/tiflash/issues/5687﻿

## Root Cause

Continuous Profiling 从 v6.1.0 版本开始被默认开启，TiDB/TiKV/TiFlash 会持续被触发 CPU Profiling，TiKV/TiFlash 的 CPU Profiling 是由 pprof-rs 实现的。pprof-rs 在 CPU Profiling 期间会注册一个 signal handler，并周期性的触发 SIGPROF 信号。在触发 SIGPROF 信号后，signal handler 被分派到业务线程上执行，进行当前线程的调用栈采样。Signal handler 在执行期间也会通过 glibc 发起系统调用，因此有机会影响 errno，并在 signal handler 执行结束后影响到业务逻辑所获取的 errno。但在当前版本的 pprof-rs 中已经对 errno 做了保护，因此当前仍没有关键证据表明该 errno 是被 pprof-rs 修改的，目前的判断依据是:

1. 问题仅在 Profiling 开启期间发生
2. pprof-rs 曾经有过非常相似的问题

## Diagnostic Steps

1. 观察 TiFlash 崩溃时的日志和 stack trace，判断它们是否是非法 errno 导致的。
2. 判断当前是否存在 Profiling 动作（包括 Continuous Profiling，Manual Profiling，调用 /debug/pprof/profile 接口）

## Resolution

定位非法 errno 根源，然后进行相应组件的修复和升级。

## Workaround

在 TiDB Dashboard 关闭 Continuous Profiling，并且暂时不要在对 TiFlash 进行 Manual Profiling。

NOTE: 目前只有 v6.1.0 和 v6.2.0 版本默认开启 Continuous Profiling，我们从 v6.1.1 版本开始默认关闭 Continuous Profiling。
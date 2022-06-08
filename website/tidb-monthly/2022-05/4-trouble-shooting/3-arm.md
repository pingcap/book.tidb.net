---
title: ARM 平台下 TiDB 服务器卡死
hide_title: true
---

# ARM 平台下 TiDB 服务器卡死

> 作者：[Kangli Mao](https://github.com/tiancaiamao) 更新于 2022.05.27 

💡  ARM平台下 tidb 服务器卡死

## Issue

在 ARM 平台中，执行稳定性测试，一段时间后，发现 tidb 进程卡死了。

grafana 或者 prometheus 更新不到数据；

tidb 进程端口没有关闭，进程也没有重启，tidb 的 CPU 使用率 100% (占满单个核)；

tidb 不再响应客户端的请求，也无法从 10080 端口获取 pprof 或者执行栈信息；

若如果使用 gdb 或者 dlv 等调试工具调试，会发现一个线程卡死在 Go runtime 的 gentraceback() 函数中，其它线程都是在 futex() 函数中睡眠。

## Root Cause

由 Go 语言的 runtime 的一个 [bug](https://github.com/golang/go/issues/52116) 引起。该 bug 被触发后，会在 Go 的 runtime 代码中的 gentraceback() 函数里面死循环。该函数是一个 runtime 内部函数，并且调用之前会持有全局的锁，所以当 bug 触发后，表现是只有一个线程处于死循环中，占用单个核 100% CPU，而其它线程处于 futex 睡眠状态。应用层 tidb 的代码得不到执行。

这个 Go runtime 的 bug 的触发条件比较复杂，只在 ARM 平台中出现(x86 和 ARM 走的是不同的代码逻辑)。触发条件需要调用到 gentraceback() 函数，并且有发生过栈分裂（跟函数调用栈的深度有一定关联），业务层的代码是很难控制触发条件的，因此目前的复现方式，主要是在长时间的稳定性测试中观察，运行几小时到几十个小时，有可能会被触发。

## Diagnostic Steps

首先确认是 ARM 平台下，x86 平台下不会触发此问题；

观察 tidb 是否是卡死的状态： 进程活着，CPU 100%，端口没关闭，但不能对外提供服务；

最后，可以通过 gdb 连接 tidb 进程，观察是否处于 gentraceback() 中死循环

## Resolution

6.1.0 的 arm 的 TiDB 我们使用了 hotfix 过的 Go1.18.2 编译，可以避开这个问题

## Workaround

使用 dev 分支的 Go，或者特殊 hotfix 过的 Go 编译器，去编译 tidb
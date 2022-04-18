# TiFlash 4.x and 5.x random crash with TLS enabled

解决方案 -  Ruoxi Sun   更新于 2022.03.24 

## Issue

TiFlash 在开启了 TLS（TiDB Cloud 默认开启，OP 默认关闭）的情况下会随机 crash。

该问题在 2022 年初的几个 TiDB Cloud POC 中陆续碰到。 

## Root Cause

在 TiDB 6.0 之前的版本，TiFlash 使用了系统自带的 openssl 库实现 TLS。而 grpc（被 TiFlash 所使用）与 openssl 有已知的不兼容，具体参考 grpc 官方 repo 中的 issue：https://github.com/grpc/grpc/pull/26834。

## Diagnostic Steps

如果遇到 TiFlash 进程 crash，且 crash 前几分钟之内 TiFlash 的 error 日志中包含以下内容，即为该问题：

```
[2022/03/01 12:56:56.508 +00:00] [Error] [<unknown>] ["grpc: /tmp/tzg/release-centos7/prepare-environments/grpc/src/core/tsi/ssl_transport_security.cc, line number : 483, log msg : Corruption detected."] [thread_id=63]
[2022/03/01 12:56:56.508 +00:00] [Error] [<unknown>] ["grpc: /tmp/tzg/release-centos7/prepare-environments/grpc/src/core/lib/security/transport/secure_endpoint.cc, line number : 208, log msg : Decryption error: TSI_DATA_CORRUPTED"] [thread_id=63]
```

﻿

## Resolution

将 TiFlash 所使用的 ssl 库替换为 grpc 官方推荐的 boringssl，在下列 patch 版本中修复：

v5.0.7

v5.1.5

v5.2.4

v5.3.2

v5.4.1

## Workaround

可以关闭 TLS workaround，开启 TLS 的情况下无有效 workaround 手段。
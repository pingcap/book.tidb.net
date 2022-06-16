---
title: 跨 5.3 进行 TiFlash 版本滚动升级过程中需要关闭 mpp 功能
hide_title: true
---

# 跨 5.3 进行 TiFlash 版本滚动升级过程中需要关闭 mpp 功能

**作者：Zhuhe Fang**

## Issue

<https://asktug.com/t/topic/662840>

问题现象：tiflash 跨 5.3 进行滚动版本升级过程中，查询结果可能不对。

## Root Cause

5.3 版本中有个优化exchange的功能修改了 exchange的接口（<https://github.com/pingcap/tiflash/pull/3184>）。tiflash 5.3 以前版本升级到 5.3 及以后版本的过程中，同时有老版本和新版本存在。因为 exchange 算子接口的优化导致 5.3 以前版本的 tiflash 的 exchange receiver  不能识别 5.3 及以后版本 的 tiflash 的 exchange sender发送的数据。&#x20;

也就是这个优化 feature 最终破坏了tiflash 滚动升级方式。

## Diagnostic Steps

确定是 5.3 之前的版本升级到 5.3之后的版本，包括6.0版本。

## Resolution

因为是老接口无法识别新接口，所以无法从代码层面修复。只能在跨 5.3 版本升级 tiflash 的时候，不能用滚动升级的方式，只能用关闭所有tiflash 实例再启用新版本的升级方式。这会导致 tiflash 升级过程中查询失败，但是一般滚动升级过程中也不保证所有运行的查询成功，评估下来，这个重启升级方案可以接受。

## Workaround

在跨 5.3 版本升级 tiflash 的时候，先关闭所有老版本 tiflash 实例，然后启用新版本 tiflash。

（ps: 争取把这个重启升级方式做到 tiup 中，避免手动操作。）

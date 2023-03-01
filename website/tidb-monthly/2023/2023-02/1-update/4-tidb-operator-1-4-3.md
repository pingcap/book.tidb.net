---
title: TiDB Operator 1.4.3 Release Notes - TiDB 社区技术月刊
sidebar_label: TiDB Operator 1.4.3 Release Notes
hide_title: true
description: 本篇为 TiDB Operator 1.4.3 Release Notes，包括 bug 修复等。
keywords: [TiDB, Release Notes, 1.4.3, TiDB Operator, Bug 修复]
---

# TiDB Operator 1.4.3 Release Notes

发布日期: 2023 年 2 月 24 日

TiDB Operator 版本：1.4.3

## Bug 修复

- 修复开启 `preferIPv6` 的情况下， TiFlash 的 metric server 没有监听正确的 IPv6 地址的问题 ([#4850](https://github.com/pingcap/tidb-operator/pull/4889), [@KanShiori](https://github.com/KanShiori))
- 修复在 AWS 环境中，如果打开了 feature gate `VolumeModifying` 并且 `StorageClass` 缺少 EBS 相关参数时，TiDB Operator 会一直尝试修改 EBS 参数的问题 ([#4850](https://github.com/pingcap/tidb-operator/pull/4892), [@liubog2008](https://github.com/liubog2008))

[TiDB Operator 1.4.3 Release Notes](https://github.com/pingcap/docs-tidb-operator/blob/release-1.4/zh/releases/release-1.4.3.md)更新于 2023/2/24 09:55:07: [en,zh: release note for 1.4.3 (#2228) (#2229)](https://github.com/pingcap/docs-tidb-operator/commit/91b055d6901eba119fd2e2efe15cf01c053f8a18)

---
title: TiDB Operator 1.4.0 Release Notes - TiDB 社区技术月刊
sidebar_label: TiDB Operator 1.4.0 Release Notes
hide_title: true
description: 本篇为 TiDB Operator 1.4.0 Release Notes，包括新功能、优化提升、bug 修复等。
keywords: [TiDB, Release Notes, 1.4.0, TiDB Operator, 优化提升, 新功能]
---

# TiDB Operator 1.4.0 Release Notes

发布日期: 2022 年 12 月 29 日

TiDB Operator 版本：1.4.0

## 新功能

- 支持使用新的 `TidbDashboard` CRD 独立管理 [TiDB Dashboard](https://github.com/pingcap/tidb-dashboard) ([#4787](https://github.com/pingcap/tidb-operator/pull/4787), [@SabaPing](https://github.com/SabaPing))
- 支持为 TiKV 与 PD 配置 Liveness Probe ([#4763](https://github.com/pingcap/tidb-operator/pull/4763), [@mikechengwei](https://github.com/mikechengwei))
- 支持基于 Amazon EBS 的 TiDB 集群 volume-snapshot 的备份和恢复 ([#4698](https://github.com/pingcap/tidb-operator/pull/4698)，[@gozssky](https://github.com/gozssky))

## 优化提升

- 支持配置 `.spec.preferIPv6: true` 兼容 IPv6 网络环境 ([#4811](https://github.com/pingcap/tidb-operator/pull/4811)，[@KanShiori](https://github.com/KanShiori))

## Bug 修复

- 修复基于 EBS 快照备份无法恢复到不同 namespace 的问题 ([#4795](https://github.com/pingcap/tidb-operator/pull/4795), [@fengou1](https://github.com/fengou1))
- 修复日志备份停止占用 Complete 状态，导致调用方误认为日志备份 CR 已完成，从而无法继续对日志备份进行 Truncate 操作的问题 ([#4810](https://github.com/pingcap/tidb-operator/pull/4810), [@WizardXiao](https://github.com/WizardXiao))

[TiDB Operator 1.4.0 Release Notes](https://github.com/pingcap/docs-tidb-operator/blob/release-1.4/zh/releases/release-1.4.0.md)更新于 2022/12/30 16:26:17: [zh,en: fix 1.4.0 release notes format (#2159) (#2160)](https://github.com/pingcap/docs-tidb-operator/commit/af3e1ba49b1a64bb44720bbd9a9e00a0bf8ac90c)

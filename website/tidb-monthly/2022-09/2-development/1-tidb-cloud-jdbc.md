---
title: 使用 JDBC 连接 TiDB Cloud - TiDB 社区技术月刊
sidebar_label: 使用 JDBC 连接 TiDB Cloud
hide_title: true
description: 本文主要介绍 TiDB Cloud 使用了 TiDB 默认的配置，支持 TLSv1.1，TLSv1.2，TLSv1.3。当我们在使用 MySQL Connector/J 连接 TiDB Cloud 的时候，能否连接成功取决于 JDK 版本和 JDBC driver 的版本。
keywords: [TiDB Cloud, JDBC, JDK 17, JDBC driver]
---

# 使用 JDBC 连接 TiDB Cloud

>作者：[zhangyangyu](https://tidb.net/u/zhangyangyu/answer) 发表于  2022-09-06

TiDB Cloud 使用了 [TiDB 默认的配置](https://docs.pingcap.com/tidb/dev/enable-tls-between-clients-and-servers#supported-tls-versions)，支持 TLSv1.1，TLSv1.2，TLSv1.3。当我们在使用 MySQL Connector/J 连接 TiDB Cloud 的时候，能否连接成功取决于 JDK 版本和 JDBC driver 的版本。我们用最新的 JDK 17 来测试。

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1280X1280-1662392093313.png)﻿

## JDBC 8.0.26

使用默认的 connection uri

> jdbc:mysql://<host>:4000/test?user=root&password=<password>

连接 TiDB Cloud 会报

> Caused by: javax.net.ssl.SSLHandshakeException: No appropriate protocol (protocol is disabled or cipher suites are inappropriate)
> at java.base/sun.security.ssl.HandshakeContext.<init>(HandshakeContext.java:172)
> at java.base/sun.security.ssl.ClientHandshakeContext.<init>(ClientHandshakeContext.java:103)
> at java.base/sun.security.ssl.TransportContext.kickstart(TransportContext.java:240)
> at java.base/sun.security.ssl.SSLSocketImpl.startHandshake(SSLSocketImpl.java:443)
> at java.base/sun.security.ssl.SSLSocketImpl.startHandshake(SSLSocketImpl.java:421)
> at com.mysql.cj.protocol.ExportControlled.performTlsHandshake(ExportControlled.java:320)
> at com.mysql.cj.protocol.StandardSocketFactory.performTlsHandshake(StandardSocketFactory.java:194)
> at com.mysql.cj.protocol.a.NativeSocketConnection.performTlsHandshake(NativeSocketConnection.java:101)
> at com.mysql.cj.protocol.a.NativeProtocol.negotiateSSLConnection(NativeProtocol.java:308)

跟踪调用路径发现产生该错误的原因是因为 JDBC driver 对低版本的 MySQL server 只会使用 TLSv1 和 TLSv1.1，虽然 TiDB Cloud 支持 TLSv1.1，但是[高版本的 JDK 不支持使用 TLSv1.1](https://aws.amazon.com/cn/blogs/opensource/tls-1-0-1-1-changes-in-openjdk-and-amazon-corretto/)，所以失败。我们看下路径上关键的代码。

```java
private static String[] getAllowedProtocols(PropertySet pset, ServerVersion serverVersion, String[] socketProtocols) {
    String[] tryProtocols = null;

    // If enabledTLSProtocols configuration option is set, overriding the default TLS version restrictions.
    // This allows enabling TLSv1.2 for self-compiled MySQL versions supporting it, as well as the ability
    // for users to restrict TLS connections to approved protocols (e.g., prohibiting TLSv1) on the client side.
    String enabledTLSProtocols = pset.getStringProperty(PropertyKey.enabledTLSProtocols).getValue();
    if (enabledTLSProtocols != null && enabledTLSProtocols.length() > 0) {
        tryProtocols = enabledTLSProtocols.split("\\s*,\\s*");
    }
    // It is problematic to enable TLSv1.2 on the client side when the server is compiled with yaSSL. When client attempts to connect with
    // TLSv1.2 yaSSL just closes the socket instead of re-attempting handshake with lower TLS version. So here we allow all protocols only
    // for server versions which are known to be compiled with OpenSSL.
    else if (serverVersion == null) {
        // X Protocol doesn't provide server version, but we prefer to use most recent TLS version, though it also means that X Protocol
        // connection to old MySQL 5.7 GPL releases will fail by default, user must use enabledTLSProtocols=TLSv1.1 to connect them.
        tryProtocols = TLS_PROTOCOLS;
    } else if (serverVersion.meetsMinimum(new ServerVersion(5, 7, 28))
            || serverVersion.meetsMinimum(new ServerVersion(5, 6, 46)) && !serverVersion.meetsMinimum(new ServerVersion(5, 7, 0))
            || serverVersion.meetsMinimum(new ServerVersion(5, 6, 0)) && Util.isEnterpriseEdition(serverVersion.toString())) {
        tryProtocols = TLS_PROTOCOLS;
    } else {
        // allow only TLSv1 and TLSv1.1 for other server versions by default
        tryProtocols = new String[] { TLSv1_1, TLSv1 };
    }

    List<String> configuredProtocols = new ArrayList<>(Arrays.asList(tryProtocols));
    List<String> jvmSupportedProtocols = Arrays.asList(socketProtocols);

    List<String> allowedProtocols = new ArrayList<>();
    for (String protocol : TLS_PROTOCOLS) {
        if (jvmSupportedProtocols.contains(protocol) && configuredProtocols.contains(protocol)) {
            allowedProtocols.add(protocol);
        }
    }
    return allowedProtocols.toArray(new String[0]);

}
```

`getAllowedProtocols`在 TLS handshake 时计算可能的 TLS protocols，因为 TiDB 返回的版本字符串是`5.7.25-TiDB-v6.1.0`，所以在版本判断时最终走到了`else`分支，可选的 TLS protocol 最终只有 TLSv1 和 TLSv1.1。(在 connection uri 上显示加的`enabledTLSProtocols`也是在这里处理，然后在后面被拒绝掉）

```java
private static List<ProtocolVersion> getActiveProtocols(
        List<ProtocolVersion> enabledProtocols,
        List<CipherSuite> enabledCipherSuites,
        AlgorithmConstraints algorithmConstraints) {
    boolean enabledSSL20Hello = false;
    ArrayList<ProtocolVersion> protocols = new ArrayList<>(4);
    for (ProtocolVersion protocol : enabledProtocols) {
        if (!enabledSSL20Hello && protocol == ProtocolVersion.SSL20Hello) {
            enabledSSL20Hello = true;
            continue;
        }

        if (!algorithmConstraints.permits(
                EnumSet.of(CryptoPrimitive.KEY_AGREEMENT),
                protocol.name, null)) {
            // Ignore disabled protocol.
            continue;
        }
```

`getActiveProtocols`用来计算使用的 TLS protocol 和 cipher，但无论是 TLSv1 还是 TLSv1.1，都在`algorithmConstraints.permits`被拒绝，最终`getActiveProtocols`返回了一个空列表。

```java
@Override
public boolean permits(Set<CryptoPrimitive> primitives,
        String algorithm, AlgorithmParameters parameters) {

    boolean permitted = true;

    if (peerSpecifiedConstraints != null) {
        permitted = peerSpecifiedConstraints.permits(
                                primitives, algorithm, parameters);
    }

    if (permitted && userSpecifiedConstraints != null) {
        permitted = userSpecifiedConstraints.permits(
                                primitives, algorithm, parameters);
    }

    if (permitted) {
        permitted = tlsDisabledAlgConstraints.permits(
                                primitives, algorithm, parameters);
    }

    if (permitted && enabledX509DisabledAlgConstraints) {
        permitted = x509DisabledAlgConstraints.permits(
                                primitives, algorithm, parameters);
    }

    return permitted;
}
```

其中 TLSv1.1 会在`tlsDisabledAlgConstraints.permits(primitives, algorithm, parameters);`这里被拒绝掉，`tlsDisabledAlgConstraints`就是用来检测`java.security`文件中的`jdk.tls.disabledAlgorithms`，对于 JDK 11 它的值是：

> jdk.tls.disabledAlgorithms=SSLv3, TLSv1, TLSv1.1, RC4, DES, MD5withRSA, \
>
> DH keySize < 1024, EC keySize < 224, 3DES_EDE_CBC, anon, NULL, \
>
> include jdk.disabled.namedCurves

## JDBC 8.0.29

对照 8.0.26，8.0.29 的`getAllowedProtocols`逻辑变了，最终返回的结果是 TLSv1.2 和 TLSv1.3，所以可以成功建立连接。

```java
private static String[] getAllowedProtocols(PropertySet pset, @SuppressWarnings("unused") ServerVersion serverVersion, String[] socketProtocols) {
    List<String> tryProtocols = null;

    RuntimeProperty<String> tlsVersions = pset.getStringProperty(PropertyKey.tlsVersions);
    if (tlsVersions != null && tlsVersions.isExplicitlySet()) {
        // If tlsVersions configuration option is set then override the default TLS versions restriction.
        if (tlsVersions.getValue() == null) {
            throw ExceptionFactory.createException(SSLParamsException.class,
                    "Specified list of TLS versions is empty. Accepted values are TLSv1.2 and TLSv1.3.");
        }
        tryProtocols = getValidProtocols(tlsVersions.getValue().split("\\s*,\\s*"));
    } else {
        tryProtocols = new ArrayList<>(Arrays.asList(VALID_TLS_PROTOCOLS));
    }

    List<String> jvmSupportedProtocols = Arrays.asList(socketProtocols);
    List<String> allowedProtocols = new ArrayList<>();
    for (String protocol : tryProtocols) {
        if (jvmSupportedProtocols.contains(protocol)) {
            allowedProtocols.add(protocol);
        }
    }
    return allowedProtocols.toArray(new String[0]);
}
```

## JDBC 5.1.49

```java
protected static void transformSocketToSSLSocket(MysqlIO mysqlIO) throws SQLException {
    SocketFactory sslFact = new StandardSSLSocketFactory(getSSLSocketFactoryDefaultOrConfigured(mysqlIO), mysqlIO.socketFactory, mysqlIO.mysqlConnection);

    try {
        mysqlIO.mysqlConnection = sslFact.connect(mysqlIO.host, mysqlIO.port, null);

        String[] tryProtocols = null;

        // If enabledTLSProtocols configuration option is set then override the default TLS version restrictions. This allows enabling TLSv1.2 for
        // self-compiled MySQL versions supporting it, as well as the ability for users to restrict TLS connections to approved protocols (e.g., prohibiting
        // TLSv1) on the client side.
        // Note that it is problematic to enable TLSv1.2 on the client side when the server is compiled with yaSSL. When client attempts to connect with
        // TLSv1.2 yaSSL just closes the socket instead of re-attempting handshake with lower TLS version.
        String enabledTLSProtocols = mysqlIO.connection.getEnabledTLSProtocols();
        if (enabledTLSProtocols != null && enabledTLSProtocols.length() > 0) {
            tryProtocols = enabledTLSProtocols.split("\\s*,\\s*");
        } else if (mysqlIO.versionMeetsMinimum(5, 7, 28) || mysqlIO.versionMeetsMinimum(5, 6, 46) && !mysqlIO.versionMeetsMinimum(5, 7, 0)
                || mysqlIO.versionMeetsMinimum(5, 6, 0) && Util.isEnterpriseEdition(mysqlIO.getServerVersion())) {
            // allow all known TLS versions for this subset of server versions by default
            tryProtocols = TLS_PROTOCOLS;
        } else {
            // allow TLSv1 and TLSv1.1 for all server versions by default
            tryProtocols = new String[] { TLSv1_1, TLSv1 };

        }
```

5.1.49 和 8.0.26 是一个逻辑，走到了`else`分支，只能使用 TLSv1 和 TLSv1.1。

## 结果

对于失败的版本，我们可以在 connection uri 上添加`enabledTLSProtocols=TLSv1.2,TLSv1.3`让 JDBC driver 选择使用 TLSv1.2 或 TLSv1.3。但是`enabledTLSProtocols`从 8.0.28 开始，变成了`tlsVersions`，现在`enabledTLSProtocols`仍然保持为 alias，未来可能有变化。
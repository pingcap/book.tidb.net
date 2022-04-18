# Facebook 开源 Golang 实体框架 Ent 现已支持 TiDB

对于后端开发者来说，一款好用的框架能够大大提升应用的开发效率。为了降低开发者使用 TiDB 的门槛，方便开发者快速连接到 TiDB，我们也在和合作伙伴一起，逐步完善面向主流开发语言和框架的连接支持。

近日，Facebook 开源的 Golang 实体框架 Ent 完成了对 TiDB 数据库的支持。 Ent 是一款易于构建和维护应用程序与大数据模型的框架。具有以下特点：

- Schema 即代码：能将任何数据库表建模为 Go 对象；
- 轻松地遍历任何图形 ：可以轻松地运行查询、聚合和遍历任何图形结构；
- 静态类型和显式 API：使用代码生成静态类型和显式 API，查询数据更加便捷；
- 多存储驱动程序：支持 MySQL、PostgreSQL、SQLite、Gremlin，现在也已经支持了 TiDB；
- 可扩展：易于扩展和使用 Go 模板自定义。

下面通过一个 Hello World 的应用示例，来看下如何快速实现一个基于 Ent + TiDB 的应用。

## Hello World 应用示例

1.用 Docker 在本地启动一个 TiDB Server

```Shell
docker run -p 4000:4000 pingcap/tidb
```

现在你应该有一个运行的 TiDB 实例，开放了 4000 端口监听。

2.在本地拷贝 hello world 的示例 repo

```Shell
git clone https://github.com/hedwigz/tidb-hello-world.git
```

在这个示例 repo 中我们定义了一个简单的 User schema

```go
go title="ent/schema/user.go"
 func (User) Fields() []ent.Field {
           return []ent.Field{
                  field.Time("created_at").
                          Default(time.Now),
                  field.String("name"),
                  field.Int("age"),
          }
 }
```

然后，连接 Ent 和 TiDB：

```go
go title="main.go"
client, err := ent.Open("mysql", "root@tcp(localhost:4000)/test?parseTime=true")
if err != nil {
        log.Fatalf("failed opening connection to TiDB: %v", err)
}
defer client.Close()
// Run the auto migration tool, with Atlas.
if err := client.Schema.Create(context.Background(), schema.WithAtlas(true)); err != nil {
        log.Fatalf("failed printing schema changes: %v", err)
}
```

可以看到，在第一行我们通过一个 MySQL 语句去连接 TiDB Server，因为 TiDB 是兼容 MySQL 的，所以不需要其他特殊的 driver。 话虽如此，TiDB 和 MySQL 还是有很多不同，尤其是与 Schema 迁移相关的操作，比如 SQL 诊断和迁移规划。所以，Atlas 可以自动监测出是连接到 TiDB，做相应的迁移处理。 此外，第七行我们使用`schema.WithAtlas(true)`，表示 Ent 是使用“Atlas”作为迁移引擎。Atlas 是 Ent 刚刚发布的迁移引擎，得益于 Atlas 的最新设计，对新数据库的支持也变得前所未有的简单。

最后，我们新建一条 user 数据，并保存到 TiDB 中，以用于后需的数据读取和输出。

```go
go title="main.go"
client.User.Create().
               SetAge(30).
               SetName("hedwigz").
               SaveX(context.Background())
user := client.User.Query().FirstX(context.Background())
fmt.Printf("the user: %s is %d years old\n", user.Name, user.Age)
```

3.运行这个示例程序：

```go
$ go run main.go  
the user: hedwigz is 30 years old
```

在这次快速演练中，我们成功实现了：

- 启动一个本地的 TiDB 实例；
- 连接 Ent 和 TiDB 数据库；
- 使用 Atlas 迁移 Ent Schema；
- 使用 Ent 从 TiDB 中插入和读取数据。

## 版本说明

目前，这个示例应用在 Ent v0.10 和 TiDB v5.4.0 中可以正常运行，Ent 也计划在未来继续拓展对 TiDB 的支持。如果你使用其他版本的 TiDB 或者需要帮助，欢迎加入 [asktug.com ](https://asktug.com/)来交流。如果你也有项目希望与 TiDB 适配，欢迎来 GitHub [提交 issue ](https://github.com/pingcap/community)。 除了 Ent，TiDB 此前已经添加了对 GORM 和 go-sql-driver/mysql 的支持，详情可查看文档： https://docs.pingcap.com/appdev/dev
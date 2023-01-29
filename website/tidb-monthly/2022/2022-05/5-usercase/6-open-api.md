---
title: TiCDC系列分享 Open API与业务系统集成
hide_title: true
---

# TiCDC系列分享 Open API与业务系统集成

> 作者：**[dapan3927](https://tidb.net/u/dapan3927/post/all)** 发表于  **2022-05-18**

### 前言

   公司准备将内部运行的部分业务系统进行升级，将后台的MySQL数据库迁移至TiDB。在正式升级之前，先通过测试环境进行模拟操作。目前在测试环境中部署了两个单机的TiDB集群，分别部署在移动云和腾讯云的服务器上。移动云TiDB实例的数据库中部署TiCDC将数据同步至腾讯云TiDB数据库。为了便于在业务系统直接对TiCDC进行管理，希望在业务系统中集成TiCDC的管理。

   TiCDC 提供 OpenAPI 功能，用户可以通过 OpenAPI 对 TiCDC 集群进行查询和运维操作。通过 OpenAPI 可以完成如下 TiCDC 集群的运维操作：

- [获取 TiCDC 节点状态信息](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#获取-ticdc-节点状态信息)
- [检查 TiCDC 集群的健康状态](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#检查-ticdc-集群的健康状态)
- [创建同步任务](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#创建同步任务)
- [删除同步任务](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#删除同步任务)
- [更新同步任务配置](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#更新同步任务配置)
- [查询同步任务列表](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#查询同步任务列表)
- [查询特定同步任务](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#查询特定同步任务)
- [暂停同步任务](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#暂停同步任务)
- [恢复同步任务](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#恢复同步任务)
- [查询同步子任务列表](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#查询同步子任务列表)
- [查询特定同步子任务](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#查询特定同步子任务)
- [查询 TiCDC 服务进程列表](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#查询-ticdc-服务进程列表)
- [驱逐 owner 节点](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#驱逐-owner-节点)
- [手动触发表的负载均衡](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#手动触发表的负载均衡)
- [手动调度表到其他节点](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#手动调度表到其他节点)
- [动态调整 TiCDC Server 日志级别](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api#动态调整-ticdc-server-日志级别)

具体参见官方文档 [TiCDC Open API](https://docs.pingcap.com/zh/tidb/v6.0/ticdc-open-api)。在业务系统中主要需要实现查询同步任务列表、查询特定同步任务、创建/删除/暂停/恢复同步任务。下文的内容主要围绕这几个接口的具体实现展开。

### 部署架构 & 硬件环境

   两台服务器的部署架构相同。部署的topo.yaml文件如下：

```
# # Global variables are applied to all deployments and used as the default value of
# # the deployments if a specific deployment value is missing.
global:
 user: "tidb"
 ssh_port: 22
 deploy_dir: "/tidb-deploy"
 data_dir: "/tidb-data"

# # Monitored variables are applied to all the machines.
monitored:
 node_exporter_port: 9100
 blackbox_exporter_port: 9115

server_configs:
 tidb:
   log.slow-threshold: 300
 tikv:
   readpool.storage.use-unified-pool: false
   readpool.coprocessor.use-unified-pool: true
 pd:
   replication.enable-placement-rules: true
   replication.location-labels: ["host"]
 tiflash:
   logger.level: "info"

pd_servers:
 - host: 192.168.0.6

tidb_servers:
 - host: 192.168.0.6

tikv_servers:
 - host: 192.168.0.6
   port: 20160
   status_port: 20180
   config:
     server.labels: { host: "logic-host-1" }

 - host: 192.168.0.6
   port: 20161
   status_port: 20181
   config:
     server.labels: { host: "logic-host-2" }

 - host: 192.168.0.6
   port: 20162
   status_port: 20182
   config:
     server.labels: { host: "logic-host-3" }

tiflash_servers:
 - host: 192.168.0.6

monitoring_servers:
 - host: 192.168.0.6

grafana_servers:
 - host: 192.168.0.6
```

TiCDC在TiDB集群部署之后通过scale-out部署，具体参考：[使用 TiUP 扩容缩容 TiDB 集群](https://docs.pingcap.com/zh/tidb/v6.0/scale-tidb-using-tiup) 

扩容yaml文件如下:

```markdown
cdc_servers:
 - host: 192.168.0.6
   gc-ttl: 86400
   deploy_dir: "tidb-deploy/cdc-8300"
   log_dir: "tidb-deploy/cdc-8300/log"
   data_dir: "tidb-data/cdc-8300"
```

两台服务器的主要配置信息如下：

| 服务器 | OS               | CPU & 内存 | 磁盘     | 网络带宽 |
| ------ | ---------------- | ---------- | -------- | -------- |
| 移动云 | Ununtu 20.04 LTS | 4核 32G    | SSD 100G | 1M       |
| 腾讯云 | Ununtu 20.04 LTS | 4核 8G     | SSD 100G | 10M      |

### 功能开发

   现有的业务系统采用前后端分离的方式开发，前端基于Vue+Element UI，后端基于Spring Boot，构建RESTful API提供给前端访问。在后端Controller中新增ticdc的控制器，主要代码如下：

```
package com.javaweb.admin.controller;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.javaweb.common.common.BaseController;
import com.javaweb.common.constant.CommonConstants;
import com.javaweb.common.utils.CommonUtils;
import com.javaweb.common.utils.DBUtils;
import com.javaweb.common.utils.HttpUtils;
import com.javaweb.common.utils.JsonResult;
import org.apache.poi.ss.formula.functions.T;
import org.springframework.web.bind.annotation.*;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/ticdc")
public class TicdcController extends BaseController {
    /**
     * 获取同步任务列表
     * @return
     */
    @GetMapping("/changefeeds")
    public JsonResult changefeeds() {

        String result = HttpUtils.doGet(CommonConstants.QUERY_TASK_LIST_URL,null);
        result = "{\"records\":"+result+",\"total\":1,\"size\":10,\"current\":1,\"orders\":[],\"searchCount\":true,\"pages\":1}";
        return JsonResult.success(CommonUtils.strToJson(result));

    }

    /**
     * 查询特定同步任务
     * @param feed_id 同步任务id
     * @return
     */
    @GetMapping("/changefeedsinfo/{feed_id}")
    public JsonResult changefeedsinfo(@PathVariable("feed_id") String feed_id) {

        String url = CommonConstants.QUERY_TASK_INFO_URL;
        url = url.replace("{0}",feed_id);
        String result = HttpUtils.doGet(url,null);
        //获取同步的表名
        JSONObject obj = CommonUtils.strToJson(result);
        String json = obj.getString("task_status");
        JSONArray jsonArray = JSONArray.parseArray(json);
        JSONObject jsonObject = jsonArray.getJSONObject(0);
        JSONArray array = jsonObject.getJSONArray("table_ids");
        String table_ids = array.toJSONString().replace("[","").replace("]","");

        //根据table_id获取对应的表名
        String sql = "select tidb_table_id,table_name  from INFORMATION_SCHEMA.`TABLES` where tidb_table_id in ("+table_ids+")";
        String temp = "";
        try {
            List list= DBUtils.convertList(DBUtils.GetResultSet(sql));
            temp = JSON.toJSONString(list);

        } catch (SQLException throwables) {
            throwables.printStackTrace();
        }
        result = "{\"tables\":"+temp+",\"records\":"+result+",\"total\":1,\"size\":10,\"current\":1,\"orders\":[],\"searchCount\":true,\"pages\":1}";
        return JsonResult.success(CommonUtils.strToJson(result));

    }

    /**
     * 暂停同步任务
     * @param feed_id 同步任务id
     * @return
     */
    @PostMapping("/pause/{feed_id}")
    public JsonResult pause(@PathVariable("feed_id") String feed_id) {

        String url = CommonConstants.PAUSE_TASK_URL;
        url = url.replace("{0}",feed_id);
        String result = HttpUtils.doPost(url,null);
        JsonResult<T> obj = new JsonResult<>();
        obj.setCode(result.equals("202")?202:200);
        obj.setData(null);
        obj.setMsg(result);
        return JsonResult.success(obj);

    }

    /**
     * 恢复同步任务
     * @param feed_id 同步任务id
     * @return
     */
    @PostMapping("/resume/{feed_id}")
    public JsonResult resume(@PathVariable("feed_id") String feed_id) {

        String url = CommonConstants.RESUME_TASK_URL;
        url = url.replace("{0}",feed_id);
        String result = HttpUtils.doPost(url,null);
        JsonResult<T> obj = new JsonResult<>();
        obj.setCode(result.equals("202")?202:200);
        obj.setData(null);
        obj.setMsg(result);
        return JsonResult.success(obj);

    }

    /**
     * 创建同步任务
     * @param feed_id 同步任务id
     * @return
     */
    @PostMapping("/create/{feed_id}")
    public JsonResult create(@PathVariable("feed_id") String feed_id) {

        String url = CommonConstants.CREATE_TASK_URL;
        Map<String,Object> param = new HashMap<>();
        param.put("changefeed_id",feed_id);
        param.put("sink_uri","blackhole://");
        param.put("ignore_ineligible_table",true);
        url = url.replace("{0}",feed_id);
        String result = HttpUtils.doPostJson(url,param);
        JsonResult<T> obj = new JsonResult<>();
        obj.setCode(result.equals("202")?202:200);
        obj.setData(null);
        obj.setMsg(result);
        return JsonResult.success(obj);

    }

    /**
     * 删除同步任务
     * @param feed_id 同步任务id
     * @return
     */
    @DeleteMapping("/delete/{feed_id}")
    public JsonResult delete(@PathVariable("feed_id") String feed_id) {

        String url = CommonConstants.DELETE_TASK_URL;
        url = url.replace("{0}",feed_id);
        String result = HttpUtils.doDelete(url,null);
        JsonResult<T> obj = new JsonResult<>();
        obj.setCode(result.equals("202")?202:200);
        obj.setData(null);
        obj.setMsg(result);
        return JsonResult.success(obj);

    }

}
```

代码写的比较简单，出于简化考虑，没有进行Service分层设计。编译通过后启动，通过ApiPost测试一下新增的ticdc API接口，以调用获取同步任务列表为例，若服务端正常响应，输出信息如下图：

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/changefeeds-1652871396833.png) 





好了，后台服务接口运行正常。接下来编写前端页面调用该接口进行数据展示。主要前端页面代码如下：

```
<template>
  <div class="ele-body">
    <el-card shadow="never">
      <el-form
        :model="form"
        label-width="77px"
        class="ele-form-search"
        @keyup.enter.native="reload"
        @submit.native.prevent>
        <el-row :gutter="15">
          <el-col :lg="6" :md="12">
            <el-form-item label="FeedId:">
              <el-input
                clearable
                v-model="form.feedid"
                placeholder="请输入同步任务ID"/>
            </el-form-item>
          </el-col>
          <el-col :lg="12" :md="12">
            <div class="ele-form-actions">
              <el-button
                type="primary"
                icon="el-icon-search"
                class="ele-btn-icon"
                @click="reload">查询同步列表
              </el-button>
              <el-button type="warning" @click="pause">暂停任务</el-button>
              <el-button type="primary" @click="resume">恢复任务</el-button>
              <el-button type="primary" @click="create">创建任务</el-button>
              <el-button type="danger" @click="deljob">删除任务</el-button>
            </div>
          </el-col>
        </el-row>
      </el-form>
      <!-- 数据表格 -->
      <ele-data-table
        ref="table"
        :where="where"
        :data="propTableData.col"
        :choose.sync="selection"
        height="calc(100vh - 315px)">
          <el-table-column type="selection" width="45" align="center" fixed="left"/>
          <el-table-column type="index" :index="index" label="编号" width="60" align="center" fixed="left" show-overflow-tooltip/>
          <el-table-column prop="id" label="ID" :min-width="90" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="state" label="状态" :min-width="160" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="checkpoint_time" label="CheckPoint" :min-width="160" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="checkpoint_tso" label="TSO" :min-width="160" sortable="custom" show-overflow-tooltip />
        <!-- 操作列 -->
          <el-table-column label="操作" min-width="150px" align="center" :resizable="false"  fixed="right">
        <template slot-scope="{row}">
          <el-link
            type="primary"
            :underline="false"
            icon="el-icon-edit"
            @click="openEdit(row)"
            >查看任务
          </el-link>
        </template>
          </el-table-column>
      </ele-data-table>
    </el-card>
    <!-- 显示同步任务明细窗口 -->
    <task
      :visible.sync="showEdit"
      :data="editData"
      :tableList="tableData"
      @done="reload"/>
  </div>
</template>

<script>
import Task from './task';
export default {
  name: 'TicdcChangefeeds',
  components: {Task},
  computed: {
  },
  data() {
    return {
      // 表格数据接口
      url: '/ticdc/changefeeds',
      // 表格列配置
      columns: [
        {
          columnKey: 'selection',
          type: 'selection',
          width: 45,
          align: 'center',
          fixed: "left"
        },
        {
          prop: 'id',
          label: 'ID',
          width: 60,
          align: 'center',
          showOverflowTooltip: true,
          fixed: "left"
        },
        {
          prop: 'state',
          label: '状态',
          align: 'center',
          showOverflowTooltip: true,
          minWidth: 110,
        },
        {
          prop: 'checkpoint_time',
          label: 'CheckPointTime',
          align: 'center',
          showOverflowTooltip: true,
          minWidth: 150
        },
        {
          prop: 'checkpoint_tso',
          label: 'TSO',
          align: 'center',
          showOverflowTooltip: true,
          minWidth: 100
        },
        {
          columnKey: 'action',
          label: '操作',
          width: 130,
          align: 'center',
          resizable: false,
          slot: 'action',
          fixed: "right"
        }
      ],
      // 表格搜索条件
      where: {},
      form:{},
      // 表格选中数据
      selection: [],
      // 当前编辑数据
      current: null,
      // 是否显示编辑弹窗
      showEdit: false,
      // 编辑回显数据
      editData: null,
      tableData: null,
      // 同步任务数据
      propTableData: {
        sel: null, // 选中行
        col: []  //同步任务列表
      },
    };
  },
  methods: {
    /* 刷新表格 */
    reload() {
      this.$http.get('/ticdc/changefeeds').then(res => {
        this.propTableData.col = res.data.data.records;
      }).catch(e => {
        this.$message.error(e.message);
      });

    },
    /* 创建同步任务 */
    create(){
      this.$http.post('/ticdc/create/' + [this.form.feedid]).then(res => {
        if (res.data.data.code === 202) {
          this.$message.success(res.data.msg);
          this.reload();
        } else {
          this.$message.error(res.data.msg);
        }
      }).catch(e => {
        this.$message.error(e.message);
      });


    },
    /* 暂停同步任务 */
    pause(){
      if (!this.selection.length) {
        this.$message.error('请选择一个同步')
        return;
      }
      let id = this.selection[0].id;
      this.$http.post('/ticdc/pause/' + [id]).then(res => {
        if (res.data.data.code === 202) {
          this.$message.success(res.data.msg);
          this.reload();
        } else {
          this.$message.error(res.data.msg);
        }
      }).catch(e => {
        this.$message.error(e.message);
      });


    },
    /* 恢复同步任务 */
    resume(){
      if (!this.selection.length) {
        this.$message.error('请选择一个同步任务')
        return;
      }
      let id = this.selection[0].id;
      this.$http.post('/ticdc/resume/' + [id]).then(res => {
        if (res.data.data.code === 202) {
          this.$message.success(res.data.msg);
          this.reload();
        } else {
          this.$message.error(res.data.msg);
        }
      }).catch(e => {
        this.$message.error(e.message);
      });

    },
    /* 删除任务 */
    deljob(){
      if (!this.selection.length) {
        this.$message.error('请至少选择一条数据')
        return;
      }
      let id = this.selection[0].id;
      this.$http.delete('/ticdc/delete/' + [id]).then(res => {
        if (res.data.data.code === 202) {
          this.$message.success(res.data.msg);
          this.reload();
        } else {
          this.$message.error(res.data.msg);
        }
      }).catch(e => {
        this.$message.error(e.message);
      });

    },
    reset() {
      this.where = {};
      this.reload();
    },
    /* 显示同步任务明细窗口 */
    openEdit(row) {
      this.current = row;
      this.$http.get('/ticdc/changefeedsinfo/'+row.id).then(res => {
        this.editData = res.data.data.records;
        this.tableData = res.data.data.tables;
      }).catch(e => {
        this.$message.error(e.message);
      });

      this.showEdit = true;
    }
  }
}
</script>
```

同步任务详细信息页面代码如下：

```
<!-- 同步任务详细信息弹窗 -->
<template>
  <el-dialog
    :title="isUpdate ? '修改同步任务' : '同步任务详细信息'"
    :visible="visible"
    width="840px"
    :destroy-on-close="true"
    :lock-scroll="false"
    @update:visible="updateVisible"
  >
    <el-form :model="form" ref="form" :rules="rules" label-width="120px">
      <el-row :gutter="15">
        <el-col :md="12" :sm="12">
          <el-form-item label="id:" prop="id">
            <el-input
              :maxlength="20"
              v-model="form.id"
              placeholder=""
              clearable
            />
          </el-form-item>
        </el-col>
        <el-col :md="12" :sm="12">
          <el-form-item label="sink_uri:" prop="sink_uri">
            <el-input
              :maxlength="20"
              v-model="form.sink_uri"
              placeholder=""
              clearable
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="15">
        <el-col :md="12" :sm="12">
          <el-form-item label="create_time:" prop="create_time">
            <el-input
              v-model="form.create_time"
              placeholder=""
              class="ele-fluid ele-text-left"
            />
          </el-form-item>
        </el-col>
        <el-col :md="12" :sm="12">
          <el-form-item label="checkpoint_time:">
            <el-input v-model="form.checkpoint_time" placeholder="" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="15">
        <el-col :md="12" :sm="12">
          <el-form-item label="start_ts:" prop="start_ts">
            <el-input
              v-model="form.start_ts"
              placeholder=""
              class="ele-fluid ele-text-left"
            />
          </el-form-item>
        </el-col>
        <el-col :md="12" :sm="12">
          <el-form-item label="checkpoint_tso:">
            <el-input v-model="form.checkpoint_tso" placeholder="" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="15">
        <el-col :md="12" :sm="12">
          <el-form-item label="sort_engine:" prop="sort_engine">
            <el-input
              v-model="form.sort_engine"
              placeholder=""
              class="ele-fluid ele-text-left"
            />
          </el-form-item>
        </el-col>
        <el-col :md="12" :sm="12">
          <el-form-item label="state:">
            <el-input v-model="form.state" placeholder="" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <ele-data-table
      ref="table"
      :where="where"
      :data="form.tables"
      :choose.sync="selection"
      height="calc(100vh - 515px)"
    >
      <el-table-column
        type="selection"
        width="45"
        align="center"
        fixed="left"
      />
      <el-table-column
        type="index"
        :index="index"
        label="编号"
        width="60"
        align="center"
        fixed="left"
        show-overflow-tooltip
      />
      <el-table-column
        prop="tidb_table_id"
        label="同步表ID"
        :min-width="60"
        sortable="custom"
        show-overflow-tooltip
      />
      <el-table-column
        prop="table_name"
        label="同步表名称"
        :min-width="120"
        sortable="custom"
        show-overflow-tooltip
      />
      <!-- 操作列 -->
      <el-table-column
        label="操作"
        min-width="60px"
        align="center"
        :resizable="false"
        fixed="right"
      >
        <template slot-scope="{ row }">
          <el-link
            type="primary"
            :underline="false"
            icon="el-icon-edit"
            @click="openEdit(row)"
            v-if="false"
            >查看任务
          </el-link>
          <el-popconfirm
            class="ele-action"
            title="确定要删除此会员吗？"
            @confirm="remove(row)"
          >
            <el-link
              type="danger"
              slot="reference"
              :underline="false"
              icon="el-icon-delete"
              >删除
            </el-link>
          </el-popconfirm>
        </template>
      </el-table-column>
    </ele-data-table>

    <div slot="footer">
      <el-button @click="updateVisible(false)">取消 </el-button>
      <el-button type="primary" @click="save" :loading="loading"
        >保存
      </el-button>
    </div>
  </el-dialog>
</template>

<script>
export default {
  name: "Task",
  props: {
    // 弹窗是否打开
    visible: Boolean,
    // 修改回显的数据
    data: Object,
    tableList: Object,
  },
  data() {
    return {
      // 表单数据
      form: Object.assign({}, this.data),
      where: {},
      // 表格选中数据
      selection: [],
      // 表单验证规则
      rules: {
        id: [{ required: true, message: "请输入同步id", trigger: "blur" }],
        sink_uri: [
          { required: true, message: "请输入下游Uri", trigger: "blur" },
        ],
      },
      // 提交状态
      loading: false,
      // 是否是修改
      isUpdate: false,
    };
  },
  watch: {
    data() {
      if (this.data) {
        this.form = Object.assign({}, this.data);
        this.form.tables = this.tableList;
        this.isUpdate = true;
      } else {
        this.form = {};
        this.isUpdate = false;
      }
    },
  },
  methods: {
    /* 更新visible */
    updateVisible(value) {
      this.$emit("update:visible", value);
    },
  },
};
</script>
```

### 功能测试

   现在前端页面和后端服务都已经开发完成，通过Yarn启动前端后进入TiCDC管理页面。下面针对界面上的几个接口功能分别做测试：

- 查询同步列表 点击查询同步按钮列表，显示目前TiCDC节点中配置的同步任务列表。界面刷新后显示同步任务列表如下：

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/CDC-1652871632328.png) 

点击查看任务显示同步任务详细信息窗口：

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/feedinfo-1652871963745.png) 



- 暂停/恢复/创建/删除任务的测试见如下动图：

 ![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/95fba8f906fafa56e50261effd19875f8606a11e-1652872180176.gif) 

好了，TiCDC Open API和业务系统的集成实践就到此结束了，希望能给感兴趣的同学提供些许参考。感谢你的阅读！

### 总结

1. 参考TiCDC Open API官方文档后，在现有的开发框架中比较方便地集成了CDC的管理功能。感觉TiDB在后续的版本中会提供更多的开放接口，方便应用系统实现集成。
2. 上述代码主要以测试和演示为目的，服务接口中的异常处理未实现。
3. 根据官网文档中的提示，TiCDC OpenAPI 目前为实验功能，不建议在生产环境中使用该功能。希望在后续发布的LTS版本中得到完善，作为正式功能发布，实现应用系统在生产环境中的正式应用。
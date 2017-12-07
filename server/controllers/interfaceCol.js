const interfaceColModel = require('../models/interfaceCol.js');
const interfaceCaseModel = require('../models/interfaceCase.js');
const interfaceModel = require('../models/interface.js');
const projectModel = require('../models/project.js');
const baseController = require('./base.js');
const yapi = require('../yapi.js');
const _ = require('underscore');

class interfaceColController extends baseController {
    constructor(ctx) {
        super(ctx);
        this.colModel = yapi.getInst(interfaceColModel);
        this.caseModel = yapi.getInst(interfaceCaseModel);
        this.interfaceModel = yapi.getInst(interfaceModel);
        this.projectModel = yapi.getInst(projectModel);
    }

    /**
     * 获取所有接口集
     * @interface /col/list
     * @method GET
     * @category col
     * @foldnumber 10
     * @param {String} project_id email名称，不能为空
     * @returns {Object}
     * @example
     */
    async list(ctx) {
        try {
            let id = ctx.query.project_id;
            let project = await this.projectModel.getBaseInfo(id);
            if (project.project_type === 'private') {
                if (await this.checkAuth(project._id, 'project', 'view') !== true) {
                    return ctx.body = yapi.commons.resReturn(null, 406, '没有权限');
                }
            }
            let result = await this.colModel.list(id);

            for (let i = 0; i < result.length; i++) {
                result[i] = result[i].toObject();
                result[i].caseList = await this.caseModel.list(result[i]._id);
            }

            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 增加接口集
     * @interface /col/add_col
     * @method POST
     * @category col
     * @foldnumber 10
     * @param {Number} project_id
     * @param {String} name
     * @param {String} desc
     * @returns {Object}
     * @example
     */

    async addCol(ctx) {
        try {
            let params = ctx.request.body;
            params = yapi.commons.handleParams(params, {
                name: 'string',
                project_id: 'number',
                desc: 'string'
            });

            if (!params.project_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
            }
            if (!params.name) {
                return ctx.body = yapi.commons.resReturn(null, 400, '名称不能为空');
            }

            let auth = await this.checkAuth(params.project_id, 'project', 'edit')
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }

            let result = await this.colModel.save({
                name: params.name,
                project_id: params.project_id,
                desc: params.desc,
                uid: this.getUid(),
                add_time: yapi.commons.time(),
                up_time: yapi.commons.time()
            });
            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 添加了接口集 <a href="/project/${params.project_id}/interface/col/${result._id}">${params.name}</a>`,
                type: 'project',
                uid: this.getUid(),
                username: username,
                typeid: params.project_id
            });
            // this.projectModel.up(params.project_id,{up_time: new Date().getTime()}).then();
            ctx.body = yapi.commons.resReturn(result);

        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 获取一个接口集下的所有的接口用例
     * @interface /col/case_list
     * @method GET
     * @category col
     * @foldnumber 10
     * @param {String} col_id 接口集id
     * @returns {Object}
     * @example
     */
    async getCaseList(ctx) {
        try {
            let id = ctx.query.col_id;
            if (!id || id == 0) {
                return ctx.body = yapi.commons.resReturn(null, 407, 'col_id不能为空')
            }
            let resultList = await this.caseModel.list(id, 'all');
            let colData = await this.colModel.get(id);
            let project = await this.projectModel.getBaseInfo(colData.project_id);

            if (project.project_type === 'private') {
                if (await this.checkAuth(project._id, 'project', 'view') !== true) {
                    return ctx.body = yapi.commons.resReturn(null, 406, '没有权限');
                }
            }

            for (let index = 0; index < resultList.length; index++) {
                let result = resultList[index].toObject();
                let data = await this.interfaceModel.get(result.interface_id);
                if (!data) {
                    await this.caseModel.del(result._id);
                    continue;
                }
                let projectData = await this.projectModel.getBaseInfo(data.project_id);
                result.path = projectData.basepath + data.path;
                result.method = data.method;
                result.req_body_type = data.req_body_type;
                result.req_headers = this.handleParamsValue(data.req_headers, result.req_headers);
                result.res_body = data.res_body;
                result.res_body_type = data.res_body_type;

                result.req_body_form = this.handleParamsValue(data.req_body_form, result.req_body_form)
                result.req_query = this.handleParamsValue(data.req_query, result.req_query)
                result.req_params = this.handleParamsValue(data.req_params, result.req_params)
                resultList[index] = result;
            }
            resultList = resultList.sort((a, b) => {
                return a.index - b.index;
            });
            let ctxBody = yapi.commons.resReturn(resultList);
            ctxBody.colData = colData;
            ctx.body = ctxBody;
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    requestParamsToObj(arr) {
        if (!arr || !Array.isArray(arr) || arr.length === 0) {
            return {}
        }
        let obj = {};
        arr.forEach(item => {
            obj[item.name] = ''
        })
        return obj;
    }

    /**
     * 获取一个接口集下的所有的接口用例
     * @interface /col/case_list_by_var_params
     * @method GET
     * @category col
     * @foldnumber 10
     * @param {String} col_id 接口集id
     * @returns {Object}
     * @example
     */

    async getCaseListByVariableParams(ctx) {
        try {
            let id = ctx.query.col_id;
            if (!id || id == 0) {
                return ctx.body = yapi.commons.resReturn(null, 407, 'col_id不能为空')
            }
            let resultList = await this.caseModel.list(id, 'all');
            if (resultList.length === 0) {
                return ctx.body = yapi.commons.resReturn([])
            }
            let project = await this.projectModel.getBaseInfo(resultList[0].project_id);

            if (project.project_type === 'private') {
                if (await this.checkAuth(project._id, 'project', 'view') !== true) {
                    return ctx.body = yapi.commons.resReturn(null, 406, '没有权限');
                }
            }

            for (let index = 0; index < resultList.length; index++) {
                let result = resultList[index].toObject();
                let item = {}, body, query, bodyParams, pathParams;
                let data = await this.interfaceModel.get(result.interface_id);
                if (!data) {
                    await this.caseModel.del(result._id);
                    continue;
                }
                item._id = result._id;
                item.casename = result.casename;
                body = yapi.commons.json_parse(data.res_body);
                body = typeof body === 'object' ? body : {};
                item.body = Object.assign({}, body);
                query = this.requestParamsToObj(data.req_query);
                pathParams = this.requestParamsToObj(data.req_params);
                if (data.req_body_type === 'form') {
                    bodyParams = this.requestParamsToObj(data.req_body_form);
                } else {
                    bodyParams = yapi.commons.json_parse(data.req_body_other);
                    bodyParams = typeof bodyParams === 'object' ? bodyParams : {}
                }
                item.params = Object.assign(pathParams, query, bodyParams)
                item.index = result.index;
                resultList[index] = item;
            }

            ctx.body = yapi.commons.resReturn(resultList);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 增加一个接口用例
     * @interface /col/add_case
     * @method POST
     * @category col
     * @foldnumber 10
     * @param {String} casename
     * @param {Number} col_id
     * @param {Number} project_id
     * @param {String} domain
     * @param {String} path
     * @param {String} method
     * @param {Object} req_query
     * @param {Object} req_headers
     * @param {String} req_body_type
     * @param {Array} req_body_form
     * @param {String} req_body_other
     * @returns {Object}
     * @example
     */

    async addCase(ctx) {
        try {
            let params = ctx.request.body;
            params = yapi.commons.handleParams(params, {
                casename: 'string',
                project_id: 'number',
                col_id: 'number',
                interface_id: 'number',
                case_env: 'string'
            });


            if (!params.project_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
            }

            if (!params.interface_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空');
            }

            let auth = await this.checkAuth(params.project_id, 'project', 'edit');
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }

            if (!params.col_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '接口集id不能为空');
            }


            if (!params.casename) {
                return ctx.body = yapi.commons.resReturn(null, 400, '用例名称不能为空');
            }

            params.uid = this.getUid();
            params.index = 0;
            params.add_time = yapi.commons.time();
            params.up_time = yapi.commons.time();
            let result = await this.caseModel.save(params);
            let username = this.getUsername();

            this.colModel.get(params.col_id).then((col) => {
                yapi.commons.saveLog({
                    content: `<a href="/user/profile/${this.getUid()}">${username}</a> 在接口集 <a href="/project/${params.project_id}/interface/col/${params.col_id}">${col.name}</a> 下添加了接口用例 <a href="/project/${params.project_id}/interface/case/${result._id}">${params.casename}</a>`,
                    type: 'project',
                    uid: this.getUid(),
                    username: username,
                    typeid: params.project_id
                });
            });
            this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).then();

            ctx.body = yapi.commons.resReturn(result);

        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    async addCaseList(ctx) {
        try {
            let params = ctx.request.body;
            params = yapi.commons.handleParams(params, {
                project_id: 'number',
                col_id: 'number'
            });
            if (!params.interface_list || !Array.isArray(params.interface_list)) {
                return ctx.body = yapi.commons.resReturn(null, 400, 'interface_list 参数有误');
            }
            const _id_list = params._id_list || [];

            if (!params.project_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
            }

            let auth = await this.checkAuth(params.project_id, 'project', 'edit');
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }


            if (!params.col_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '接口集id不能为空');
            }

            let data = {
                uid: this.getUid(),
                index: 0,
                add_time: yapi.commons.time(),
                up_time: yapi.commons.time(),
                project_id: params.project_id,
                col_id: params.col_id
            }

            const model_list = [];

            for (let i = 0; i < params.interface_list.length; i++) {
                let interfaceData = await this.interfaceModel.getBaseinfo(params.interface_list[i]);

                //  复制集合
                if (_id_list.length) {
                    let interface_model_case = await this.caseModel.get(_id_list[i]);
                    interface_model_case = interface_model_case.toObject();
                    for (let k in interface_model_case) {
                        if (Object.prototype.hasOwnProperty.call(interface_model_case, k)) {
                            if (k !== '_id' && k !== 'add_time' && k !== 'up_time' && k !== '__v' && k !== 'col_id') {
                                data[k] = interface_model_case[k];
                            }
                        }
                    }
                } else {
                    data.interface_id = params.interface_list[i];
                    data.casename = interfaceData.title;
                    data.req_body_other = interfaceData.req_body_other;
                    data.req_body_type = interfaceData.req_body_type;
                }

                let case_model = await this.caseModel.save(data);
                case_model = case_model.toObject();
                model_list.push(case_model);

                let username = this.getUsername();
                this.colModel.get(params.col_id).then((col) => {
                    yapi.commons.saveLog({
                        content: `<a href="/user/profile/${this.getUid()}">${username}</a> 在接口集 <a href="/project/${params.project_id}/interface/col/${params.col_id}">${col.name}</a> 下导入了接口 <a href="/project/${params.project_id}/interface/case/${data.interface_id}">${data.casename}</a>`,
                        type: 'project',
                        uid: this.getUid(),
                        username: username,
                        typeid: params.project_id
                    });
                });
            }

            // 替换实例中代码里的$.id
            if (_id_list.length) {
                for (let i = 0; i < model_list.length; i++) {
                    let case_model = model_list[i];
                    let case_model_req_body_other_obj = {};
                    let case_model_req_query_list = [];

                    let new_param_obj = {};
                    let new_param_list = [];

                    // 处理post参数
                    if (case_model.req_body_other) {
                        try {
                            case_model_req_body_other_obj = yapi.commons.json_parse(case_model.req_body_other);
                        } catch (e) {
                            console.log('e ->', e);
                        }
                    }

                    // 处理get参数
                    if (case_model.req_query.length > 1) {
                        case_model_req_query_list = case_model.req_query;
                    }

                    const dealParams = async (key, value) => {
                        let case_id = "";
                        let case_data = {};
                        let replace_case_model = "";
                        let replace_word = "";
                        let res = "";
                        if (value.indexOf("$.") !== -1 && value.slice(0, 1) === "$") {
                            case_id = value.substring(2, value.length).split(".")[0];
                            case_data = await this.caseModel.get(case_id);
                            case_data = case_data.toObject();
                            replace_case_model = await this.caseModel.getByInterfaceIdAndColId(case_data.interface_id, case_model.col_id, case_data.index);
                            replace_case_model = replace_case_model[0];
                            replace_word = "$." + replace_case_model['_id'] + value.substr(2 + case_id.length, value.length);
                            res = replace_word;
                        } else {
                            res = value;
                        }
                        return res;
                    }


                    // 处理req_body_other 参数
                    if (Object.keys(case_model_req_body_other_obj).length) {
                        for (let k in case_model_req_body_other_obj) {
                            new_param_obj[k] = await dealParams(k, case_model_req_body_other_obj[k].toString());
                        }
                    }

                    // 处理req_body_other 参数
                    if (case_model_req_query_list.length > 1) {
                        for (let j = 0; j < case_model_req_query_list.length; j++) {
                            let new_param_list_obj = {};
                            for (let k in case_model_req_query_list[j]) {
                                new_param_list_obj[k] = await dealParams(k, case_model_req_query_list[j][k].toString());
                            }
                            new_param_list.push(new_param_list_obj);
                        }
                        case_model["req_query"] = new_param_list;
                    }

                    let needUpdate = false;
                    if (Object.keys(new_param_obj).length) {
                        needUpdate = true;
                        case_model["req_body_other"] = JSON.stringify(new_param_obj);
                    }

                    if (new_param_list.length) {
                        needUpdate = true;
                        case_model["req_query"] = new_param_list;
                    }

                    if (needUpdate) {
                        await this.caseModel.up(case_model["_id"], case_model);
                    }
                }

            }


            this.projectModel.up(params.project_id, { up_time: new Date().getTime() }).then();
            ctx.body = yapi.commons.resReturn('ok');

        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 更新一个接口用例
     * @interface /col/up_case
     * @method POST
     * @category col
     * @foldnumber 10
     * @param {number} id
     * @param {String} casename
     * @param {String} domain
     * @param {String} path
     * @param {String} method
     * @param {Object} req_query
     * @param {Object} req_headers
     * @param {String} req_body_type
     * @param {Array} req_body_form
     * @param {String} req_body_other
     * @returns {Object}
     * @example
     */

    async upCase(ctx) {
        try {
            let params = ctx.request.body;
            params = yapi.commons.handleParams(params, {
                id: 'number',
                casename: 'string'
            });

            if (!params.id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '用例id不能为空');
            }

            let caseData = await this.caseModel.get(params.id);
            let auth = await this.checkAuth(caseData.project_id, 'project', 'edit');
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }

            params.uid = this.getUid();

            //不允许修改接口id和项目id
            delete params.interface_id;
            delete params.project_id;
            let result = await this.caseModel.up(params.id, params);
            let username = this.getUsername();
            this.colModel.get(caseData.col_id).then((col) => {
                yapi.commons.saveLog({
                    content: `<a href="/user/profile/${this.getUid()}">${username}</a> 在接口集 <a href="/project/${caseData.project_id}/interface/col/${caseData.col_id}">${col.name}</a> 更新了接口用例 <a href="/project/${caseData.project_id}/interface/case/${params.id}">${params.casename || caseData.casename}</a>`,
                    type: 'project',
                    uid: this.getUid(),
                    username: username,
                    typeid: caseData.project_id
                });
            });

            this.projectModel.up(caseData.project_id, { up_time: new Date().getTime() }).then();

            ctx.body = yapi.commons.resReturn(result);

        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 获取一个接口用例详情
     * @interface /col/case
     * @method GET
     * @category col
     * @foldnumber 10
     * @param {String} caseid
     * @returns {Object}
     * @example
     */

    async getCase(ctx) {
        try {
            let id = ctx.query.caseid;
            let result = await this.caseModel.get(id);
            if (!result) {
                return ctx.body = yapi.commons.resReturn(null, 400, '不存在的case');
            }
            result = result.toObject();
            let data = await this.interfaceModel.get(result.interface_id);
            if (!data) {
                return ctx.body = yapi.commons.resReturn(null, 400, '找不到对应的接口，请联系管理员')
            }
            data = data.toObject();
            let projectData = await this.projectModel.getBaseInfo(data.project_id);
            result.path = projectData.basepath + data.path;
            result.method = data.method;
            result.req_body_type = data.req_body_type;
            result.req_headers = this.handleParamsValue(data.req_headers, result.req_headers);
            result.res_body = data.res_body;
            result.res_body_type = data.res_body_type;
            result.req_body_form = this.handleParamsValue(data.req_body_form, result.req_body_form)
            result.req_query = this.handleParamsValue(data.req_query, result.req_query)
            result.req_params = this.handleParamsValue(data.req_params, result.req_params)

            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 400, e.message)
        }
    }

    /**
     * 
     * @param {*} params 接口定义的参数
     * @param {*} val  接口case 定义的参数值
     */
    handleParamsValue(params, val) {
        let value = {};
        try {
            params = params.toObject();
        } catch (e) { }
        if (params.length === 0 || val.length === 0) {
            return params;
        }
        val.forEach((item, index) => {
            value[item.name] = item;
        })
        params.forEach((item, index) => {
            if (!value[item.name] || typeof value[item.name] !== 'object') return null;
            params[index].value = value[item.name].value;
            if (!_.isUndefined(value[item.name].enable)) {
                params[index].enable = value[item.name].enable
            }
        })
        return params;
    }

    /**
     * 更新一个接口集name或描述
     * @interface /col/up_col
     * @method POST
     * @category col
     * @foldnumber 10
     * @param {String} name
     * @param {String} desc
     * @returns {Object}
     * @example
     */

    async upCol(ctx) {
        try {
            let params = ctx.request.body;
            let id = params.col_id;
            if (!id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '缺少 col_id 参数');
            }
            let colData = await this.colModel.get(id);
            if (!colData) {
                return ctx.body = yapi.commons.resReturn(null, 400, '不存在');
            }
            let auth = await this.checkAuth(colData.project_id, 'project', 'edit')
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }
            delete params.col_id;
            let result = await this.colModel.up(id, params);
            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了接口集 <a href="/project/${colData.project_id}/interface/col/${id}">${colData.name}</a> 的信息`,
                type: 'project',
                uid: this.getUid(),
                username: username,
                typeid: colData.project_id
            });

            ctx.body = yapi.commons.resReturn(result)
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 400, e.message)
        }
    }

    /**
     * 更新多个接口case index
     * @interface /col/up_col_index
     * @method POST
     * @category col
     * @foldnumber 10
     * @param {Array}  [id, index]
     * @returns {Object}
     * @example
     */

    async upCaseIndex(ctx) {
        try {
            let params = ctx.request.body;
            if (!params || !Array.isArray(params)) {
                ctx.body = yapi.commons.resReturn(null, 400, "请求参数必须是数组")
            }
            params.forEach((item) => {
                if (item.id) {
                    this.caseModel.upCaseIndex(item.id, item.index).then((res) => { }, (err) => {
                        yapi.commons.log(err.message, 'error')
                    })
                }

            });

            return ctx.body = yapi.commons.resReturn('成功！')
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 400, e.message)
        }
    }

    /**
     * 删除一个接口集
     * @interface /col/del_col
     * @method GET
     * @category col
     * @foldnumber 10
     * @param {String}
     * @returns {Object}
     * @example
     */

    async delCol(ctx) {
        try {
            let id = ctx.query.col_id;
            let colData = await this.colModel.get(id);
            if (!colData) {
                ctx.body = yapi.commons.resReturn(null, 400, "不存在的id")
            }

            if (colData.uid !== this.getUid()) {
                let auth = await this.checkAuth(colData.project_id, 'project', 'danger')
                if (!auth) {
                    return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
                }
            }
            let result = await this.colModel.del(id);
            await this.caseModel.delByCol(id);
            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了接口集 ${colData.name} 及其下面的接口`,
                type: 'project',
                uid: this.getUid(),
                username: username,
                typeid: colData.project_id
            });
            return ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            yapi.commons.resReturn(null, 400, e.message)
        }
    }

    /**
     *
     * @param {*} ctx
     */

    async delCase(ctx) {
        try {
            let caseid = ctx.query.caseid;
            let caseData = await this.caseModel.get(caseid);
            if (!caseData) {
                ctx.body = yapi.commons.resReturn(null, 400, "不存在的caseid")
            }

            if (caseData.uid !== this.getUid()) {
                let auth = await this.checkAuth(caseData.project_id, 'project', 'danger')
                if (!auth) {
                    return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
                }
            }

            let result = await this.caseModel.del(caseid);

            let username = this.getUsername();
            this.colModel.get(caseData.col_id).then((col) => {
                yapi.commons.saveLog({
                    content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了接口集 <a href="/project/${caseData.project_id}/interface/col/${caseData.col_id}">${col.name}</a> 下的接口 ${caseData.casename}`,
                    type: 'project',
                    uid: this.getUid(),
                    username: username,
                    typeid: caseData.project_id
                });
            });

            this.projectModel.up(caseData.project_id, { up_time: new Date().getTime() }).then();
            return ctx.body = yapi.commons.resReturn(result);


        } catch (e) {
            yapi.commons.resReturn(null, 400, e.message)
        }
    }

    convertString(variable) {
        if (variable instanceof Error) {
            return variable.name + ': ' + variable.message;
        }
        try {
            return JSON.stringify(variable, null, '   ');
        } catch (err) {
            return variable || '';
        }
    }

    async runCaseScript(ctx) {
        let params = ctx.request.body;
        let script = params.script;
        if (!script) {
            return ctx.body = yapi.commons.resReturn('ok');
        }

        let logs = [];

        let result = {
            assert: require('assert'),
            status: params.response.status,
            body: params.response.body,
            header: params.response.header,
            records: params.records,
            params: params.params,
            log: (msg) => {
                logs.push('log: ' + this.convertString(msg))
            }
        }

        try {
            result = yapi.commons.sandbox(result, script);
            result.logs = logs;
            return ctx.body = yapi.commons.resReturn(result);
        } catch (err) {
            logs.push(this.convertString(err));
            result.logs = logs;
            return ctx.body = yapi.commons.resReturn(result, 400, err.name + ": " + err.message)
        }

    }

}

module.exports = interfaceColController

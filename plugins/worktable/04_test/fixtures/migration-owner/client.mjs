import React from 'react'
import {requireProtocol} from 'dsh-worktable/sdk'
export const inject=[]
export function apply(ctx){ctx.inject(['worktableApplicationViews'],child=>child.effect(()=>{requireProtocol(child.worktableApplicationViews.describe(),['application-migration-v1']);return child.worktableApplicationViews.register('migration-example',{page:()=>React.createElement('p',null,'独立合成资料示例。使用模块内“升级与恢复”检查版本、计划、显式执行与失败恢复；不读取任何用户资料。此验收夹具仅运行一个实例。')})},'synthetic migration view'))}

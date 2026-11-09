import type { StudyWorkspace } from './study-workspace.ts'

/** One active learning task and the classroom that represents it. */
export type ClassroomTask = { taskId: string; lessonId: string; subject: string; roleId: string }
export type TaskSession = { taskId: string; lessonId: string; roleId: string; sessionId: string; revision: number }

/** Host-owned task/lesson facts; this owner never guesses from the current global Session. */
export interface ClassroomTaskDirectory {
  task(instanceId: string, taskId: string): Promise<ClassroomTask | null>
  /** Null for a legacy/manual classroom that has no task identity. */
  lesson(instanceId: string, lessonId: string): Promise<ClassroomTask | null>
}

/** Native Session creation stays with {@link StudyRoles}; this owner decides which task may use it. */
export interface TaskSessionRoleOwner {
  ensureTask(input: { instanceId: string; roleId: string; taskId: string; lessonId: string; viewId?: string }): Promise<{ sessionId: string; revision: number }>
  openTask(input: { instanceId: string; roleId: string; taskId: string; lessonId: string; sessionId: string; revision: number }): Promise<{ sessionId: string }>
}

/**
 * A study task owns one native teacher Session. The binding is durable (role
 * bindings table, `kind:'task'`, keyed by instance+role+task), so refreshes,
 * two open views or a retried entry resolve the same Session instead of
 * falling back to the role-level one. Legacy classrooms without a task return
 * null and the caller keeps the previous role-session behavior.
 */
export class StudyTaskSessions {
  constructor(private workspace: StudyWorkspace, private roles: TaskSessionRoleOwner, private directory: ClassroomTaskDirectory) {}
  private async learnerView(viewId: string) {
    const context = await this.workspace.resolveView(viewId)
    if (context.profile.kind !== 'learner') throw Error('资料库不能打开课堂会话')
    return context
  }
  async ensure(viewId: string, taskId: string): Promise<TaskSession> {
    if (typeof taskId !== 'string' || !taskId) throw Error('需要明确的学习任务')
    const context = await this.learnerView(viewId)
    const task = await this.directory.task(context.instance.id, taskId)
    if (!task || task.taskId !== taskId) throw Error('学习任务没有可打开的课堂')
    const binding = await this.roles.ensureTask({ instanceId: context.instance.id, roleId: task.roleId, taskId, lessonId: task.lessonId, viewId })
    return { taskId, lessonId: task.lessonId, roleId: task.roleId, sessionId: binding.sessionId, revision: binding.revision }
  }
  /** Task-level Session for teaching prepared from a saved classroom, or null for a legacy classroom. */
  async forLesson(viewId: string, lessonId: string, roleId: string): Promise<TaskSession | null> {
    const context = await this.learnerView(viewId)
    const task = await this.directory.lesson(context.instance.id, lessonId)
    if (!task) return null
    if (task.roleId !== roleId) throw Error('课堂会话的角色与任务不一致')
    const binding = await this.roles.ensureTask({ instanceId: context.instance.id, roleId, taskId: task.taskId, lessonId, viewId })
    return { taskId: task.taskId, lessonId, roleId, sessionId: binding.sessionId, revision: binding.revision }
  }
  open(instanceId: string, roleId: string, session: TaskSession) {
    return this.roles.openTask({ instanceId, roleId, taskId: session.taskId, lessonId: session.lessonId, sessionId: session.sessionId, revision: session.revision })
  }
}

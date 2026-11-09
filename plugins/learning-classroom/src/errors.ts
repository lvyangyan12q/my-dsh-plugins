/** Business error crossing the `/api/learning-classroom` boundary. */
export class ClassroomError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'ClassroomError'
  }
}

// Only expected, operator-facing failures may be exposed by the error middleware.
export class RequestError extends Error {
  constructor(message: string, public readonly status: 400 | 409 | 413 = 400) {
    super(message);
    this.name = "RequestError";
  }
}

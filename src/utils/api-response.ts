export class ApiResponse<T> {
  public success: boolean;
  public message: string;
  public data?: T;

  constructor(success: boolean, message: string, data?: T) {
    this.success = success;
    this.message = message;
    this.data = data;
  }
}

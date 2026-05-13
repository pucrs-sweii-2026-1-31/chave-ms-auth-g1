import { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

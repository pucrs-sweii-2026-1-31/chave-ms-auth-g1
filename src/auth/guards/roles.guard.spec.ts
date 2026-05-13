import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function makeContext(roles: string[]): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: { roles },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("allows requests when no roles are required", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(makeContext(["user"]))).toBe(true);
  });

  it("allows a user that has a required role", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["admin"]) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(makeContext(["user", "admin"]))).toBe(true);
  });

  it("blocks a user that lacks the required role", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["admin"]) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(() => guard.canActivate(makeContext(["user"]))).toThrow(ForbiddenException);
  });
});

import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ description: "Service health status" })
  getHealth(): { status: string; service: string; timestamp: string } {
    return {
      status: "ok",
      service: "chave-ms-auth",
      timestamp: new Date().toISOString(),
    };
  }
}

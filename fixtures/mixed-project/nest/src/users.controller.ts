import { UserDto } from "./user.dto";

@Controller("users")
export class UsersController {
  @Get(":id")
  @ApiOperation({ summary: "Get user", description: "Returns one user" })
  getUser(
    @Param("id") id: string,
    @Query("verbose") verbose: boolean = false,
  ): Promise<UserDto> {
    throw new Error("fixture only");
  }
}

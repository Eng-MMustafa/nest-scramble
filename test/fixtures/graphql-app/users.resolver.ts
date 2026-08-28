import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';

export class UserModel {
  id!: number;
  name!: string;
  email!: string;
}

export class CreateUserInput {
  name!: string;
  email!: string;
  bio?: string;
}

@Resolver(() => UserModel)
export class UsersResolver {
  /**
   * List every registered user.
   * Ordered by signup date, newest first.
   */
  @Query(() => [UserModel], { name: 'users' })
  findAll(@Args('limit', { nullable: true }) limit?: number): UserModel[] {
    return [];
  }

  @Query(() => UserModel)
  user(@Args('id') id: number): UserModel {
    return { id, name: 'x', email: 'x@y.z' };
  }

  @Mutation(() => UserModel)
  createUser(@Args('input') input: CreateUserInput): UserModel {
    return { id: 1, name: input.name, email: input.email };
  }

  @Subscription(() => UserModel)
  userAdded(): UserModel {
    return { id: 1, name: 'x', email: 'x@y.z' };
  }

  private helper(): void {
    // Not decorated — must not be documented.
  }
}

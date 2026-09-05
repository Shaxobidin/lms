/**
 * Maqsad: foydalanuvchilarni boshqarish endpointlari (F-01, F-17).
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignRoleSchema,
  createUserSchema,
  cursorPaginationSchema,
  listUsersSchema,
  updateProfileSchema,
  uuidSchema,
  type AssignRoleInput,
  type CreateUserInput,
  type CursorPagination,
  type ListUsersInput,
  type RoleCode,
  type UpdateProfileInput,
} from '@lms/shared';
import { z } from 'zod';
import { UsersService } from './users.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const listQuerySchema = listUsersSchema.merge(cursorPaginationSchema);
const setStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'BLOCKED']),
  reason: z.string().trim().min(3).max(500),
});
const revokeRoleSchema = z.object({ roleCode: z.string().min(2).max(32) });

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission([
    'user:read:all',
    'user:read:own_faculty',
    'user:read:own_department',
    'user:read:own_group',
  ])
  @ApiOperation({ summary: "Foydalanuvchilar ro'yxati (rolga mos filtrlangan)" })
  async list(
    @Query(zodQuery(listQuerySchema)) query: ListUsersInput & CursorPagination,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.list(query, query, actor);
  }

  @Get(':id')
  @RequirePermission(
    ['user:read:all', 'user:read:own_faculty', 'user:read:own_department', 'user:read:own_group'],
    { resource: 'user', path: 'params.id' },
  )
  @ApiOperation({ summary: "Foydalanuvchi ma'lumotlari" })
  async findOne(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.users.findById(id);
  }

  @Post()
  @RequirePermission('user:create:all')
  @ApiOperation({ summary: 'Yangi foydalanuvchi yaratish' })
  async create(
    @Body(zodBody(createUserSchema)) dto: CreateUserInput,
    @CurrentUser() actor: RequestUser,
    @ClientIp() ip: string,
  ) {
    return this.users.create(dto, actor, ip);
  }

  @Patch(':id/profile')
  @RequirePermission(['user:update:all', 'user:update:own'], {
    resource: 'user',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Profilni yangilash' })
  async updateProfile(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateProfileSchema)) dto: UpdateProfileInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.updateProfile(id, dto, actor);
  }

  @Post('roles')
  @RequirePermission(['role:manage:all', 'user:manage:all'])
  @ApiOperation({ summary: 'Foydalanuvchiga rol berish' })
  async assignRole(
    @Body(zodBody(assignRoleSchema)) dto: AssignRoleInput,
    @CurrentUser() actor: RequestUser,
    @ClientIp() ip: string,
  ) {
    return this.users.assignRole(dto, actor, ip);
  }

  @Post(':id/roles/revoke')
  @RequirePermission(['role:manage:all', 'user:manage:all'])
  @ApiOperation({ summary: 'Rolni bekor qilish' })
  async revokeRole(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(revokeRoleSchema)) dto: { roleCode: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.revokeRole(id, dto.roleCode as RoleCode, actor);
  }

  @Patch(':id/status')
  @RequirePermission('user:manage:all')
  @ApiOperation({ summary: 'Hisobni bloklash yoki faollashtirish' })
  async setStatus(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(setStatusSchema)) dto: { status: 'ACTIVE' | 'BLOCKED'; reason: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.setStatus(id, dto.status, dto.reason, actor);
  }

  @Get('me/sessions')
  @ApiOperation({ summary: 'Mening faol sessiyalarim' })
  async mySessions(@CurrentUser() actor: RequestUser) {
    return this.users.listSessions(actor.id);
  }
}

import { Controller, Post, Get, Put, Body, UseGuards, HttpCode, HttpStatus, Res, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from './decorators';
import { IsString, IsOptional } from 'class-validator';
import { Response } from 'express';

class UpdateProfileDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    bio?: string;

    @IsString()
    @IsOptional()
    location?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    timezone?: string;

    @IsString()
    @IsOptional()
    resumeUrl?: string;

    @IsOptional()
    workExperience?: Record<string, unknown> | unknown[];

    @IsOptional()
    skills?: string[];

    @IsOptional()
    isProfileComplete?: boolean;
}

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(dto);

        // Set JWT token in HTTP-only cookie
        res.cookie('accessToken', result.accessToken, {
            httpOnly: true,
            secure: true, // MUST be true for SameSite=None
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // Return only user data, not the token
        return { user: result.user };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getProfile(
        @CurrentUser() user: any,
        @Query('userId') userId?: string
    ) {
        const id = (user.role === 'ADMIN' && userId) ? userId : user.id;
        return this.authService.getProfile(id);
    }

    @Put('profile')
    @UseGuards(JwtAuthGuard)
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateProfileDto,
    ) {
        return this.authService.updateProfile(userId, dto);
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @UseGuards(JwtAuthGuard)
    async logout(@CurrentUser('id') userId: string, @Res({ passthrough: true }) res: Response) {
        await this.authService.logout(userId);

        // Clear the cookie
        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        });

        return { message: 'Logged out successfully' };
    }

    @Post('detect-timezone')
    async detectTimezone(@Body('ip') ip?: string) {
        return this.authService.detectTimezone(ip);
    }


    @Post('verify-link')
    @HttpCode(HttpStatus.OK)
    async verifyLink(@Body('token') token: string, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.verifyMagicLink(token);

        // Set JWT token in HTTP-only cookie
        res.cookie('accessToken', result.accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        return { user: result.user };
    }
}

import { Controller, Post, Get, Put, Body, UseGuards, HttpCode, HttpStatus, Res } from '@nestjs/common';
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
    workExperience?: any;

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
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // Return only user data, not the token
        return { user: result.user };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getProfile(@CurrentUser('id') userId: string) {
        return this.authService.getProfile(userId);
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
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        });

        return { message: 'Logged out successfully' };
    }

    @Get('detect-timezone')
    async detectTimezone(@Body('ip') ip?: string) {
        return this.authService.detectTimezone(ip);
    }
}

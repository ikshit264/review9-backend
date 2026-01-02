import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RegisterDto, LoginDto } from './dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { GeolocationService } from '../common/geolocation.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private geoService: GeolocationService,
        private notificationsService: NotificationsService,
    ) { }

    async register(dto: RegisterDto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (existingUser) {
            throw new ConflictException('Email already registered');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password: hashedPassword,
                name: dto.name,
                role: dto.role,
                plan: dto.role === 'COMPANY' ? 'FREE' : null, // Only companies get plans
            },
        });

        await this.notificationsService.attachNotificationsToUser(user.email, user.id);

        const { password, ...result } = user;
        return result;
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
            select: {
                id: true,
                email: true,
                password: true,
                name: true,
                role: true,
                plan: true,
                bio: true,
                location: true,
                phone: true,
                timezone: true,
                isProfileComplete: true,
                resumeUrl: true,
                workExperience: true,
                skills: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(dto.password, user.password);
        if (!passwordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const sessionToken = uuidv4();
        console.log('[Auth] Generated sessionToken:', sessionToken, 'for user:', user.email);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { activeSessionToken: sessionToken },
        });

        await this.notificationsService.attachNotificationsToUser(user.email, user.id);

        const payload = { sub: user.id, email: user.email, role: user.role, sessionToken };
        const accessToken = this.jwtService.sign(payload);
        console.log('[Auth] JWT signed with sessionToken:', sessionToken);

        const { password, ...userData } = user;

        console.log('[Auth] Login successful for:', user.email);
        console.log('[Auth] User isProfileComplete:', userData.isProfileComplete);

        return { accessToken, user: userData };
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                plan: true,
                bio: true,
                location: true,
                phone: true,
                timezone: true,
                isProfileComplete: true,
                resumeUrl: true,
                workExperience: true,
                skills: true,
                createdAt: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        return user;
    }

    async updateProfile(userId: string, data: {
        name?: string;
        bio?: string;
        location?: string;
        phone?: string;
        timezone?: string;
        resumeUrl?: string;
        workExperience?: Record<string, unknown> | unknown[];
        skills?: string[];
        isProfileComplete?: boolean;
    }) {
        console.log('[Auth] updateProfile called for user:', userId);
        console.log('[Auth] Received data:', JSON.stringify(data, null, 2));

        const updateData: {
            name?: string;
            bio?: string;
            location?: string;
            phone?: string;
            timezone?: string;
            resumeUrl?: string;
            workExperience?: Prisma.InputJsonValue;
            skills?: string[];
            isProfileComplete?: boolean;
        } = {};

        // Selectively assign properties to avoid type conflicts
        if (data.name !== undefined) updateData.name = data.name;
        if (data.bio !== undefined) updateData.bio = data.bio;
        if (data.location !== undefined) updateData.location = data.location;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.timezone !== undefined) updateData.timezone = data.timezone;
        if (data.resumeUrl !== undefined) updateData.resumeUrl = data.resumeUrl;
        if (data.workExperience !== undefined) updateData.workExperience = data.workExperience as Prisma.InputJsonValue;
        if (data.skills !== undefined) updateData.skills = data.skills;

        // If isProfileComplete is explicitly provided, use it
        // Otherwise, auto-complete if all mandatory fields are present
        if (data.isProfileComplete === undefined || data.isProfileComplete === null) {
            console.log('[Auth] isProfileComplete not provided, checking mandatory fields...');
            const mandatoryFields = ['name', 'phone', 'timezone', 'location'];
            const allPresent = mandatoryFields.every(field => data[field] || (field === 'name' && data.name));
            console.log('[Auth] All mandatory fields present:', allPresent);
            if (allPresent) {
                updateData.isProfileComplete = true;
                console.log('[Auth] Auto-setting isProfileComplete = true');
            }
        } else {
            console.log('[Auth] isProfileComplete explicitly provided:', data.isProfileComplete);
        }
        // If isProfileComplete is explicitly set (true or false), it's already in updateData

        console.log('[Auth] Final updateData:', JSON.stringify(updateData, null, 2));

        const user = await this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                plan: true,
                bio: true,
                location: true,
                phone: true,
                timezone: true,
                isProfileComplete: true,
                resumeUrl: true,
                workExperience: true,
                skills: true,
                createdAt: true,
            },
        });

        console.log('[Auth] Updated user isProfileComplete:', user.isProfileComplete);
        console.log('[Auth] Returning user data to frontend');

        return user;
    }

    async logout(userId: string) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { activeSessionToken: null },
        });
        return { message: 'Logged out successfully' };
    }

    async validateSession(userId: string, sessionToken: string) {
        let user;
        try {
            user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
        } catch (error) {
            console.error('[Auth] validateSession: Database error during findUnique:', error);
            throw error;
        }

        if (!user) {
            console.log('[Auth] validateSession: User not found:', userId);
            throw new UnauthorizedException('User not found');
        }

        if (user.activeSessionToken !== sessionToken) {
            console.log('[Auth] validateSession: Token mismatch!');
            console.log('[Auth] Expected (DB):', user.activeSessionToken);
            console.log('[Auth] Received (JWT):', sessionToken);
            throw new UnauthorizedException('Session expired. Logged in from another device.');
        }

        return user;
    }

    async detectTimezone(ip?: string) {
        return this.geoService.getTimezoneFromIp(ip);
    }
}

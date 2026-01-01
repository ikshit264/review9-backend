import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { Request } from 'express';

interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    sessionToken: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private authService: AuthService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request: Request) => {
                    // Extract JWT from cookie
                    return request?.cookies?.accessToken;
                },
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET') || 'default-secret-change-me',
        });
    }

    async validate(payload: JwtPayload) {
        console.log('[Auth] JwtStrategy.validate called with payload:', JSON.stringify(payload));
        try {
            const user = await this.authService.validateSession(payload.sub, payload.sessionToken);
            // Only return plan for company users
            return {
                id: user.id,
                email: user.email,
                role: user.role,
                plan: user.role === 'COMPANY' ? user.plan : undefined
            };
        } catch (error) {
            console.log('[Auth] JwtStrategy validation failed:', error.message);
            throw new UnauthorizedException('Invalid session');
        }
    }
}

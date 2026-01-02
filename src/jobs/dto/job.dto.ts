import { IsString, IsNotEmpty, IsDateString, IsBoolean, IsOptional, IsArray, IsEmail } from 'class-validator';

export class CreateJobDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    roleCategory: string;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsDateString()
    interviewStartTime: string;

    @IsDateString()
    interviewEndTime: string;

    @IsBoolean()
    @IsOptional()
    tabTracking?: boolean;

    @IsBoolean()
    @IsOptional()
    eyeTracking?: boolean;

    @IsBoolean()
    @IsOptional()
    multiFaceDetection?: boolean;

    @IsString()
    @IsNotEmpty()
    timezone: string;

    @IsBoolean()
    @IsOptional()
    fullScreenMode?: boolean;

    @IsBoolean()
    @IsOptional()
    noTextTyping?: boolean;

    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    customQuestions?: string[];

    @IsString()
    @IsOptional()
    aiSpecificRequirements?: string;
}

export class InviteCandidatesDto {
    @IsArray()
    candidates: CandidateInviteDto[];
}

export class CandidateInviteDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    email: string;
}

export class UpdateJobDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    roleCategory?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsDateString()
    @IsOptional()
    interviewStartTime?: string;

    @IsDateString()
    @IsOptional()
    interviewEndTime?: string;

    @IsBoolean()
    @IsOptional()
    tabTracking?: boolean;

    @IsBoolean()
    @IsOptional()
    eyeTracking?: boolean;

    @IsBoolean()
    @IsOptional()
    multiFaceDetection?: boolean;

    @IsString()
    @IsOptional()
    timezone?: string;

    @IsBoolean()
    @IsOptional()
    fullScreenMode?: boolean;

    @IsBoolean()
    @IsOptional()
    noTextTyping?: boolean;

    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    customQuestions?: string[];

    @IsString()
    @IsOptional()
    aiSpecificRequirements?: string;
}

export class UpdateCandidateStatusDto {
    @IsString()
    @IsNotEmpty()
    status: 'PENDING' | 'INVITED' | 'REVIEW' | 'REJECTED' | 'CONSIDERED' | 'SHORTLISTED';
}

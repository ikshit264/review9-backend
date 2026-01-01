import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class StartInterviewDto {
    @IsString()
    @IsNotEmpty()
    interviewToken: string;

    @IsString()
    @IsOptional()
    resumeUrl?: string;

    @IsString()
    @IsOptional()
    resumeText?: string;
}

export class SaveResponseDto {
    @IsString()
    @IsNotEmpty()
    questionText: string;

    @IsString()
    @IsNotEmpty()
    candidateAnswer: string;

    @IsString()
    @IsOptional()
    aiAcknowledgment?: string;
}

export class ProctoringLogDto {
    @IsString()
    @IsNotEmpty()
    type: string; // tab_switch, eye_distraction, multiple_faces, etc.

    @IsEnum(['low', 'medium', 'high'])
    severity: 'low' | 'medium' | 'high';

    @IsString()
    @IsOptional()
    reason?: string;
}

export class PauseInterviewDto {
    @IsString()
    @IsNotEmpty()
    reason: string;
}

export class RespondDto {
    @IsString()
    @IsNotEmpty()
    answer: string;
}

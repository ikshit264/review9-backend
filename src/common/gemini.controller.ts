import { Controller, Post, Body, Get } from '@nestjs/common';
import { GeminiService } from './gemini.service';

@Controller('gemini')
export class GeminiController {
    constructor(private geminiService: GeminiService) { }

    // Test endpoint - no auth required
    @Post('test')
    async testGemini(@Body() body: { prompt?: string }) {
        const prompt = body.prompt || 'Say hello in one sentence.';

        // Use a simple question generation test
        const questions = await this.geminiService.generateQuestions(
            {
                jobTitle: 'Software Engineer',
                roleCategory: 'Engineering',
                jobDescription: 'Build web applications',
                resumeText: 'Experienced developer with React and Node.js skills'
            },
            3
        );

        console.log('Questions generated:', questions);

        return {
            success: true,
            message: 'Gemini API is working!',
            questions
        };
    }

    @Get('health')
    async health() {
        return {
            status: 'ok',
            service: 'gemini',
            model: 'gemini-2.5-flash',
            timestamp: new Date().toISOString()
        };
    }
}

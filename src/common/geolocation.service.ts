import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GeolocationService {
    async getTimezoneFromIp(ip?: string) {
        try {
            // If no IP (localhost/testing), use a default or empty
            const url = ip && ip !== '::1' && ip !== '127.0.0.1'
                ? `https://ipapi.co/${ip}/json/`
                : 'https://ipapi.co/json/';

            const response = await axios.get(url);
            const data = response.data;

            if (data.error) {
                throw new Error(data.reason || 'IP API error');
            }

            return {
                timezone: data.timezone || 'UTC',
                location: data.city ? `${data.city}, ${data.country_name}` : 'Unknown',
                country: data.country_name || 'Unknown',
                city: data.city || 'Unknown',
            };
        } catch (error) {
            console.error('[Geolocation] detection failed:', error.message);
            return {
                timezone: 'UTC',
                location: 'Unknown',
                country: 'Unknown',
                city: 'Unknown'
            };
        }
    }
}

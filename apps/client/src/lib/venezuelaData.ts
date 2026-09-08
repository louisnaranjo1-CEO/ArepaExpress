export const VENEZUELA_DATA: Record<string, string[]> = {
    "Amazonas": ["Puerto Ayacucho", "San Fernando de Atabapo", "Maroa", "San Juan de Manapiare", "San Carlos de Río Negro"],
    "Anzoátegui": ["Barcelona", "Puerto La Cruz", "Lechería", "Guanta", "El Tigre", "Anaco", "Cantaura", "El Tigrito", "Puerto Píritu", "Valle de Guanape", "Clarines", "Aragua de Barcelona", "Pariaguán", "San Mateo"],
    "Apure": ["San Fernando de Apure", "Guasdualito", "Achaguas", "Elorza", "San Juan de Payara", "Mantecal", "Biruaca", "El Nula"],
    "Aragua": ["Maracay", "Turmero", "La Victoria", "Cagua", "Villa de Cura", "El Limón", "Palo Negro", "Santa Cruz", "San Mateo", "Las Tejerías", "Colonia Tovar", "Choroní", "Ocumare de la Costa", "Barbacoas"],
    "Barinas": ["Barinas", "Socopó", "Sabaneta", "Santa Bárbara", "Barinitas", "Ciudad Bolivia", "Barrancas", "Obispos", "Libertad"],
    "Bolívar": ["Ciudad Bolívar", "Puerto Ordaz", "San Félix", "Upata", "Caicara del Orinoco", "Tumeremo", "Guasipati", "El Callao", "Santa Elena de Uairén", "El Dorado", "Ciudad Piar", "Los Pijiguaos"],
    "Carabobo": ["Valencia", "Puerto Cabello", "Guacara", "Naguanagua", "San Diego", "Tocuyito", "Los Guayos", "Mariara", "Morón", "San Joaquín", "Bejuma", "Güigüe", "Montalbán", "Miranda"],
    "Cojedes": ["San Carlos", "Tinaquillo", "Tinaco", "El Pao", "El Baúl", "Las Vegas", "Macapo", "Romulo Gallegos"],
    "Delta Amacuro": ["Tucupita", "Pedernales", "Curiapo", "Sierra Imataca"],
    "Distrito Capital": ["Caracas", "Antímano", "Caricuao", "Catia", "Coche", "El Junquito", "El Paraíso", "La Candelaria", "La Florida", "La Pastora", "La Vega", "Macarao", "Petare Norte"],
    "Falcón": ["Coro", "Punto Fijo", "Santa Ana de Coro", "Dabajuro", "Churuguara", "Tucacas", "Chichiriviche", "Capadare", "Mirimire", "San Juan de los Cayos", "Adícora", "Pueblo Nuevo", "Los Taques"],
    "Guárico": [
        "San Juan de los Morros", "Calabozo", "Valle de la Pascua", "Altagracia de Orituco", "Zaraza",
        "Tucupido", "El Sombrero", "Camaguán", "Chaguaramas", "El Socorro", "San José de Guaribe",
        "Ortiz", "Santa María de Ipire", "Cabruta", "Las Mercedes del Llano", "El Calvario", "El Rastro",
        "Guardatinajas", "Cantagallo", "Parapara", "San Francisco de Tiznados", "San José de Tiznados",
        "San Lorenzo de Tiznados", "Sosa", "Puerto Miranda", "Uverito", "Paso Real de Macaira",
        "San Francisco de Macaira", "San Rafael de Orituco", "Libertad de Orituco", "Lezama", "Espino"
    ],
    "Lara": ["Barquisimeto", "Cabudare", "Carora", "El Tocuyo", "Quíbor", "Duaca", "Sanare", "Siquisique", "Sarare", "Cubiro", "Tintorero"],
    "Mérida": ["Mérida", "El Vigía", "Ejido", "Tovar", "Lagunillas", "Mucuchíes", "Timotes", "Bailadores", "Tabay", "Santo Domingo", "Nueva Bolivia", "Santa Cruz de Mora"],
    "Miranda": ["Los Teques", "Chacao", "Baruta", "El Hatillo", "Guatire", "Guarenas", "Carrizal", "San Antonio de los Altos", "Caucagua", "Higuerote", "Río Chico", "Charallave", "Cúa", "Ocumare del Tuy", "Santa Teresa del Tuy", "Petare"],
    "Monagas": ["Maturín", "Punta de Mata", "Temblador", "Caripito", "Caripe", "San Antonio de Capayacuar", "Caicara de Maturín", "Aguasay"],
    "Nueva Esparta": ["La Asunción", "Porlamar", "Pampatar", "Juan Griego", "El Valle del Espíritu Santo", "San Juan Bautista", "Punta de Piedras", "Boca de Río", "San Pedro de Coche"],
    "Portuguesa": ["Guanare", "Acarigua", "Araure", "Villa Bruzual", "Turén", "Ospino", "Biscucuy", "Guanarito", "Píritu", "Agua Blanca", "Boconoíto"],
    "Sucre": ["Cumaná", "Carúpano", "Güiria", "Cariaco", "Araya", "Marigüitar", "Río Caribe", "San Antonio del Golfo", "Yaguaraparo", "Irapa", "Tunapuy"],
    "Táchira": ["San Cristóbal", "Táriba", "Rubio", "San Antonio del Táchira", "Ureña", "La Grita", "Colón", "San Juan de Colón", "Michelena", "Capacho", "Cordero", "El Cobre"],
    "Trujillo": ["Trujillo", "Valera", "Boconó", "Pampán", "Pampanito", "Sabana de Mendoza", "Carache", "La Quebrada", "Betijoque", "Escuque", "Motatán", "Monay"],
    "Vargas": ["La Guaira", "Maiquetía", "Catia La Mar", "Macuto", "Caraballeda", "Naiguatá", "Carayaca", "Chuspa", "Todasana"],
    "Yaracuy": ["San Felipe", "Yaritagua", "Nirgua", "Chivacoa", "Aroa", "Urachiche", "Guama", "Boraure", "Sabana de Parra"],
    "Zulia": ["Maracaibo", "San Francisco", "Cabimas", "Ciudad Ojeda", "Santa Rita", "Machiques", "La Villa del Rosario", "El Moján", "Los Puertos de Altagracia", "Caja Seca", "Bachaquero", "Mene Grande", "Bobures", "La Concepción", "Encontrados"]
};

export const VENEZUELA_STATES = Object.keys(VENEZUELA_DATA).sort();

export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    // Distrito Capital & Miranda
    "caracas": { lat: 10.4806, lng: -66.9036 },
    "chacao": { lat: 10.4925, lng: -66.8558 },
    "baruta": { lat: 10.4345, lng: -66.8761 },
    "el hatillo": { lat: 10.4243, lng: -66.8252 },
    "petare": { lat: 10.4795, lng: -66.8093 },
    "los teques": { lat: 10.3444, lng: -67.0433 },
    "guarenas": { lat: 10.4633, lng: -66.6178 },
    "guatire": { lat: 10.4682, lng: -66.5447 },
    "san antonio de los altos": { lat: 10.3756, lng: -66.9536 },
    "charallave": { lat: 10.2458, lng: -66.8622 },
    "cua": { lat: 10.1636, lng: -66.8833 },
    // Carabobo
    "valencia": { lat: 10.1620, lng: -68.0077 },
    "naguanagua": { lat: 10.2542, lng: -68.0122 },
    "san diego": { lat: 10.2589, lng: -67.9547 },
    "guacara": { lat: 10.2289, lng: -67.8769 },
    "puerto cabello": { lat: 10.4731, lng: -68.0125 },
    "los guayos": { lat: 10.1833, lng: -67.9333 },
    "tocuyito": { lat: 10.1333, lng: -68.0667 },
    // Zulia
    "maracaibo": { lat: 10.6427, lng: -71.6125 },
    "san francisco": { lat: 10.5739, lng: -71.6425 },
    "cabimas": { lat: 10.3956, lng: -71.4422 },
    "ciudad ojeda": { lat: 10.2078, lng: -71.3094 },
    // Lara
    "barquisimeto": { lat: 10.0647, lng: -69.3570 },
    "cabudare": { lat: 10.0333, lng: -69.2667 },
    "carora": { lat: 10.1742, lng: -70.0767 },
    "quibor": { lat: 9.9286, lng: -69.6201 },
    // Aragua
    "maracay": { lat: 10.2469, lng: -67.5958 },
    "turmero": { lat: 10.2289, lng: -67.4744 },
    "cagua": { lat: 10.1861, lng: -67.4594 },
    "la victoria": { lat: 10.2269, lng: -67.3314 },
    "el limon": { lat: 10.2975, lng: -67.6322 },
    // Anzoátegui
    "barcelona": { lat: 10.1363, lng: -64.6860 },
    "puerto la cruz": { lat: 10.2167, lng: -64.6333 },
    "lecheria": { lat: 10.1939, lng: -64.6914 },
    "guanta": { lat: 10.2333, lng: -64.5833 },
    "el tigre": { lat: 8.8875, lng: -64.2454 },
    "anaco": { lat: 9.4289, lng: -64.4728 },
    // Bolívar
    "ciudad bolivar": { lat: 8.1292, lng: -63.5408 },
    "puerto ordaz": { lat: 8.2949, lng: -62.7303 },
    "san felix": { lat: 8.3683, lng: -62.6517 },
    // Táchira
    "san cristobal": { lat: 7.7669, lng: -72.2250 },
    "tariba": { lat: 7.8183, lng: -72.2225 },
    // Mérida
    "merida": { lat: 8.5983, lng: -71.1450 },
    "el vigia": { lat: 8.6253, lng: -71.6514 },
    "ejido": { lat: 8.5475, lng: -71.2403 },
    // Falcón
    "coro": { lat: 11.4045, lng: -69.6734 },
    "punto fijo": { lat: 11.6956, lng: -70.1996 },
    // Monagas
    "maturin": { lat: 9.7457, lng: -63.1832 },
    // Portuguesa
    "guanare": { lat: 9.0418, lng: -69.7421 },
    "acarigua": { lat: 9.5553, lng: -69.2004 },
    "araure": { lat: 9.5667, lng: -69.2167 },
    // Sucre
    "cumana": { lat: 10.4539, lng: -64.1826 },
    "carupano": { lat: 10.6678, lng: -63.2585 },
    // Barinas
    "barinas": { lat: 8.6226, lng: -70.2075 },
    // Nueva Esparta
    "porlamar": { lat: 10.9577, lng: -63.8697 },
    "pampatar": { lat: 10.9997, lng: -63.7981 },
    "la asuncion": { lat: 11.0267, lng: -63.8628 },
    // Guárico
    "san juan de los morros": { lat: 9.9115, lng: -67.3538 },
    "valle de la pascua": { lat: 9.2144, lng: -66.0076 },
    "calabozo": { lat: 8.9242, lng: -67.4293 },
    // Yaracuy
    "san felipe": { lat: 10.3399, lng: -68.7425 },
    // Trujillo
    "valera": { lat: 9.3178, lng: -70.6036 },
    "trujillo": { lat: 9.3667, lng: -70.4333 },
    // Vargas
    "la guaira": { lat: 10.5986, lng: -66.9329 },
    "maiquetia": { lat: 10.6000, lng: -66.9500 },
    // Cojedes
    "san carlos": { lat: 9.6612, lng: -68.5827 },
    // Delta Amacuro
    "tucupita": { lat: 9.0622, lng: -62.0510 },
    // Amazonas
    "puerto ayacucho": { lat: 5.6601, lng: -67.6236 }
};

export function getCityCoordinates(city?: string, state?: string): { lat: number; lng: number } | null {
    if (!city && !state) return null;
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (city) {
        const normCity = normalize(city);
        if (CITY_COORDINATES[normCity]) {
            return CITY_COORDINATES[normCity];
        }
        for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
            if (normCity.includes(key) || key.includes(normCity)) {
                return coords;
            }
        }
    }
    if (state) {
        const normState = normalize(state);
        for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
            if (normState.includes(key) || key.includes(normState)) {
                return coords;
            }
        }
    }
    return null;
}

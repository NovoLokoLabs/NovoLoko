"""Curated MiniMax Music 3 v4.6.4 library expansion.

This is intentionally idempotent. Existing stored values and artist rows are
never renamed or replaced; new rows are appended in a stable order.
"""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "csv" / "music3"


def split_words(value: str) -> list[str]:
    return [part.strip() for part in value.split("|") if part.strip()]


def themed(names: str, prompt: str) -> list[tuple[str, str]]:
    return [(name, prompt.format(name=name)) for name in split_words(names)]


GENRES = split_words(
    "Classic Rock|Hard Rock|Glam Rock|Garage Rock|Psychedelic Rock|Progressive Rock|Southern Rock|"
    "Alternative Rock|Indie Rock|Britpop|Post-Rock|Math Rock|Emo|Gothic Rock|Darkwave|Post-Punk|"
    "Noise Rock|Industrial Rock|Nu Metal|Doom Metal|Stoner Metal|Power Metal|Progressive Metal|Symphonic Metal|"
    "Black Metal|Death Metal|Metalcore|Hardcore|Post-Hardcore|Pop-Punk|Ska Punk|Art Pop|Dance-Pop|"
    "Indie Pop|K-Pop|J-Pop|Girl Group Pop|Singer-Songwriter|Soul|Alternative R&B|Neo-Soul|Quiet Storm|"
    "Boom Bap|Trap|Drill|G-Funk|Alternative Hip-Hop|Jazz Rap|Grime|Afrobeats|Amapiano|Dancehall|Dub|"
    "Americana|Alt-Country|Bluegrass|Folk Rock|Jazz Fusion|Big Band|Electro Swing|Synthwave|"
    "Industrial|IDM|Breakbeat|UK Garage|Future Bass|Hardstyle|Film Score|Trailer Music|Musical Theatre"
)


STYLE_FAMILIES = {
    "rock": split_words(
        "50s Rock and Roll|60s British Invasion|60s Psychedelic Rock|70s Classic Rock|70s Arena Rock|"
        "70s Progressive Rock|70s Glam Rock|70s Southern Rock|80s Stadium Rock|80s Hair Metal|"
        "90s Alternative Rock|90s College Rock|90s Post-Grunge|2000s Garage Revival|Modern Blues Rock"
    ),
    "indie": split_words(
        "80s Jangle Pop|80s Paisley Underground|90s Slacker Indie|90s Lo-Fi Indie|90s Britpop|"
        "90s Dream Pop|2000s Indie Sleaze|2000s Dance-Punk|2000s Post-Punk Revival|2010s Indie Folk|"
        "2010s Bedroom Pop|Modern Art Rock|Modern Noise Pop|Modern Math Rock|Modern Post-Rock"
    ),
    "punk": split_words(
        "70s First-Wave Punk|80s Hardcore Punk|80s Anarcho-Punk|80s Skate Punk|90s Pop-Punk|"
        "90s Riot Grrrl|90s Emo|2000s Emo Pop|2000s Post-Hardcore|2000s Screamo|"
        "Modern Melodic Hardcore|Modern Easycore|Modern Folk Punk|Modern Ska Punk|Modern Queercore"
    ),
    "metal": split_words(
        "70s Traditional Heavy Metal|80s NWOBHM|80s Bay Area Thrash|80s Glam Metal|90s Groove Metal|"
        "90s Alternative Metal|90s Nu Metal|90s Symphonic Metal|2000s Metalcore|2000s Melodic Death Metal|"
        "Modern Djent|Modern Progressive Metal|Modern Deathcore|Modern Blackgaze|Modern Doom Metal"
    ),
    "pop": split_words(
        "60s Girl-Group Pop|70s Soft Rock Pop|70s Disco Pop|80s New Wave Pop|80s Power Pop|"
        "90s Teen Pop|90s Europop|2000s Electropop|2000s Pop Rock|2010s EDM Pop|"
        "Modern Dance-Pop|Modern Dark Pop|Modern Art Pop|Modern Hyperpop|Modern Bedroom Pop"
    ),
    "asian_pop": split_words(
        "Second-Generation K-Pop|Third-Generation K-Pop|Fourth-Generation K-Pop|Fifth-Generation K-Pop|K-Pop R&B|"
        "K-Pop Girl-Crush|K-Pop Bubblegum|K-Pop Hyperpop|K-Pop Retro Disco|K-Pop Rock Hybrid|"
        "80s Japanese City Pop|90s J-Pop|Modern J-Pop|Japanese Idol Pop|Japanese Alternative Idol"
    ),
    "rap": split_words(
        "80s East Coast Rap|80s Golden Age Hip-Hop|90s East Coast Boom Bap|90s West Coast G-Funk|90s Southern Rap|"
        "90s Memphis Rap|2000s Crunk|2000s Chipmunk Soul|2000s Blog-Era Rap|2010s Cloud Rap|"
        "2010s Trap|Modern Detroit Rap|Modern Milwaukee Rap|Modern UK Grime|Modern UK Road Rap"
    ),
    "rap_modern": split_words(
        "Chicago Drill|UK Melodic Drill|New York Sample Drill|Latin Trap|Emo Rap|"
        "Melodic Trap|Plugg|PluggnB|Jersey Club Rap|Baltimore Club Rap|"
        "Philly Club Rap|Rage Trap|Opium-Style Rage|Drumless Abstract Rap|Industrial Hip-Hop"
    ),
    "rnb": split_words(
        "60s Motown Soul|60s Southern Soul|70s Philly Soul|70s Quiet Storm|70s Psychedelic Soul|"
        "80s Contemporary R&B|80s Boogie Funk|90s New Jack Swing|90s Hip-Hop Soul|90s Neo-Soul|"
        "2000s Contemporary R&B|2010s Alternative R&B|Modern Bedroom R&B|Modern Afro-R&B|Modern Gospel R&B"
    ),
    "funk_disco": split_words(
        "60s Deep Funk|70s P-Funk|70s Jazz-Funk|70s Disco|70s Eurodisco|"
        "80s Boogie|80s Electro-Funk|90s Acid Jazz|Modern Nu-Disco|Modern Future Funk"
    ),
    "electronic": split_words(
        "70s Berlin-School Electronic|70s Kosmische|80s Electro|80s EBM|80s Chicago House|"
        "80s Detroit Techno|90s Big Beat|90s Breakbeat Hardcore|90s Intelligent Techno|90s Trip-Hop|"
        "2000s French Electro|2000s Electroclash|2010s Future Garage|2010s Chillwave|Modern Organic Electronica"
    ),
    "club": split_words(
        "Chicago Acid House|New York Garage House|French Touch House|Afro House|Organic House|"
        "Tech House|Minimal House|Hardgroove Techno|Peak-Time Techno|Industrial Techno|"
        "Progressive Trance|Vocal Trance|Goa Trance|Hard Trance|Hardstyle"
    ),
    "bass": split_words(
        "Old-School Jungle|Atmospheric Jungle|Liquid Funk DnB|Dancefloor Drum and Bass|Neurofunk|"
        "Jump-Up Drum and Bass|UK Dubstep|Post-Dubstep|Riddim Dubstep|Melodic Dubstep|"
        "UK Garage 2-Step|Speed Garage|Bassline House|Future Bass|Wave Music"
    ),
    "country_folk": split_words(
        "40s Western Swing|50s Honky-Tonk|60s Nashville Sound|70s Outlaw Country|80s Neo-Traditional Country|"
        "90s Country Pop|Modern Red Dirt Country|Modern Appalachian Country|Modern Alt-Country|Modern Americana|"
        "Traditional Bluegrass|Progressive Bluegrass|Celtic Folk|Contemporary Folk|Indie Americana"
    ),
    "world": split_words(
        "60s Ska|70s Roots Reggae|70s Dub Reggae|80s Lovers Rock|90s Ragga Dancehall|"
        "Modern Dancehall|Classic Reggaeton|Modern Reggaeton|Latin Alternative|Brazilian MPB|"
        "Nigerian Afrobeats|Ghanaian Highlife|South African Amapiano|Afro House|Afro-Soul"
    ),
    "jazz_blues": split_words(
        "20s Hot Jazz|30s Swing Big Band|40s Bebop|50s Hard Bop|50s Cool Jazz|"
        "60s Modal Jazz|60s Soul Jazz|70s Jazz Fusion|Modern Nu Jazz|Modern Vocal Jazz|"
        "Delta Country Blues|Chicago Electric Blues|Texas Blues Rock|Jump Blues|Modern Soul Blues"
    ),
    "cinematic": split_words(
        "Golden-Age Hollywood Score|60s Spaghetti Western Score|70s Suspense Score|80s Synth Horror Score|90s Adventure Score|"
        "Modern Superhero Score|Modern Prestige Drama Score|Modern Hybrid Trailer|Modern Dark Trailer|Modern Orchestral Pop|"
        "Epic Choir and Orchestra|Minimalist Piano Score|Ambient Science-Fiction Score|Neo-Classical Chamber Score|Cinematic Post-Rock"
    ),
}


STYLE_PROMPTS = {
    "rock": "Use {name}: live-band drive, era-authentic guitars, bass, drums, hooks and vocal phrasing.",
    "indie": "Use {name}: scene-specific guitar/synth textures, human dynamics and understated but memorable writing.",
    "punk": "Use {name}: urgent tempo, direct arrangement, physical drums, concise hooks and credible vocal attack.",
    "metal": "Use {name}: authentic riff language, drum vocabulary, vocal contrast, dynamics and suitably heavy production.",
    "pop": "Use {name}: immediate melody, economical sections, layered hooks and era-correct pop production.",
    "asian_pop": "Use {name}: tightly designed sections, coordinated group vocals, rhythmic switch-ups and polished hook stacking.",
    "rap": "Use {name}: region- and era-authentic drums, flow pockets, bass language, sample choices and hook construction.",
    "rap_modern": "Use {name}: current regional drum grammar, bass movement, cadence, vocal texture and concise transitions.",
    "rnb": "Use {name}: pocket-focused rhythm, expressive lead phrasing, harmony stacks and era-aware keys, bass and drums.",
    "funk_disco": "Use {name}: interlocking rhythm parts, danceable bass, disciplined groove and period-aware sheen.",
    "electronic": "Use {name}: era-specific synthesis, sequencing, spatial design, drum programming and evolving arrangement.",
    "club": "Use {name}: club-functional low end, mixable phrasing, controlled builds and a genre-authentic peak.",
    "bass": "Use {name}: breakbeat detail, sub-bass design, tension/release and soundsystem-ready dynamics.",
    "country_folk": "Use {name}: believable acoustic or electric ensemble, conversational storytelling and regional groove.",
    "world": "Use {name}: culturally grounded rhythm, instrumentation and vocal phrasing without caricature.",
    "jazz_blues": "Use {name}: idiomatic harmony, swing or pocket, responsive ensemble playing and natural performance detail.",
    "cinematic": "Use {name}: motif-led orchestration, clear dramatic arc, dynamic contrast and screen-ready spatial depth.",
}


ADDITIONS: dict[str, list[tuple[str, str]]] = {
    "01_genre.csv": themed("|".join(GENRES), "Use {name} as the broad lane, with authentic rhythm, harmony, instrumentation, arrangement and performance practice."),
    "02_subgenre_era.csv": [
        (name, STYLE_PROMPTS[family].format(name=name))
        for family, names in STYLE_FAMILIES.items() for name in names
    ],
    "03_mood.csv": themed(
        "Tender and Reassuring|Yearning and Restless|Joyful and Carefree|Defiant but Hopeful|Grief-Stricken|Quietly Devastated|"
        "Flirtatious and Playful|Sultry and Dangerous|Awestruck and Spiritual|Homesick and Reflective|Victory-Lap Confident|"
        "Anxious and Claustrophobic|Coldly Detached|Warmly Nostalgic|Romantic but Uncertain|Mischievous and Bold|"
        "Dreamy then Explosive|Peaceful then Euphoric|Brooding then Liberated|Tense then Cathartic|"
        "Earnest and Vulnerable|Wry and Self-Aware|Regretful but Resolute|Haunted and Beautiful|Communal and Uplifting",
        "Shape a {name} emotional arc through harmony, dynamics, vocal colour, imagery and the final resolution.",
    ),
    "04_vocal_delivery.csv": themed(
        "Soft Intimate Whisper|Breath-Heavy Seductive Delivery|Fragile Emotional Vocal|Tearful Cracking Vocal|Clean Controlled Pop|"
        "Big Belted Pop Chorus|Soulful Runs and Melisma|Gospel-Style Power|Smoky Lounge Croon|Raspy Blues Delivery|"
        "Gritty Rock Shout|Loose Grunge Phrasing|Pop-Punk Snarl and Lift|Short Punk Bark|Low Metal Growl|"
        "High Metal Scream|Clean Metal Chorus|Operatic Metal Lead|Emo Pleading Vocal|Indie Deadpan|"
        "Dream-Pop Airy Vocal|Shoegaze Buried Vocal|Theatrical Glam Vocal|Cabaret Storytelling|Spoken-Word Dramatic|"
        "ASMR Close Whisper|Aggressive Rap Attack|Laid-Back Rap Pocket|Melodic Rap and Sung Hook|Triplet Trap Flow|"
        "Double-Time Rap Precision|Conversational Rap Storytelling|Detailed Narrative Rap|Silky R&B Lead|Relaxed Neo-Soul Phrasing|"
        "Funky Rhythmic Vocal|Reggae Toasting|Dance-Pop Club Vocal|Ethereal Layered Vocal|Choir-Like Stacked Harmonies|"
        "Girl-Group Call and Response|Tight Synchronized Group Delivery|Duet Trading Lines|Duet Harmonizing Together|"
        "Spoken-Sung Art Pop|Coldly Controlled Vocal|Bright Musical-Theatre Belt|Country Conversational Twang|Bluegrass High-Lonesome Lead|"
        "Jazz Torch-Song Phrasing|Vocoder Lead with Human Doubles",
        "Perform with {name}, keeping articulation, breath, timing, dynamics and supporting layers musical and believable.",
    ),
    "05_vocal_gender_type.csv": themed(
        "Female Duo|Female Duet — Contrasting Voices|Girl Group — Tight Harmonies|Girl Group — Stacked Pop Vocals|"
        "Girl Group — R&B Harmonies|Male/Female Duet|Mixed-Gender Duet — Trading Leads|Female Lead + Backing Trio|"
        "Male Lead + Backing Trio|Choir-Backed Lead|Call-and-Response Group|Unison Group Vocal|Three-Part Harmony Group|"
        "Youthful Female Lead|Mature Smoky Female Lead|Alto Female Lead|Bright Soprano Lead|Deep Contralto Lead|"
        "Androgynous Lead|Spoken Female Lead|Spoken Male Lead|Rap Duo|Rap Crew / Posse Vocal|Lead + Crowd Chant|"
        "Lead + Gang Vocals|Male Duo — Contrasting Registers|Boy Band — Layered Pop Harmonies|Mixed Vocal Quartet|"
        "Female Rap Lead + Sung Female Hook|Male Rap Lead + Sung Male Hook|Female Rap Duo|Mixed Rap Crew|"
        "Tenor Lead + Falsetto Doubles|Baritone Storyteller|Bass-Baritone Lead|Countertenor Lead|"
        "Mezzo-Soprano Lead|Soul Trio|Gospel Quartet|Large Gospel Choir|Small Chamber Choir",
        "Use {name} as the lead-vocal arrangement, with clear roles, sensible ranges, coordinated doubles and harmonies.",
    ),
    "06_instruments.csv": themed(
        "Electric Guitar + Bass + Live Drums|Grunge Guitars + Bass + Loose Live Drums|Heavy Guitars + Bass + Double-Kick Drums|"
        "Pop-Punk Guitars + Bass + Punchy Drums|Acoustic Guitar + Bass + Brushes|Piano + Bass + Live Drums|"
        "Funk Guitar + Bass + Tight Drums|Synths + 808 Bass + Trap Drums|Strings + Piano + Cinematic Percussion|"
        "Industrial Synths + Distorted Bass + Electronic Drums|Two Electric Guitars + Bass + Arena Drums|"
        "Clean Jangle Guitar + Bass + Live Drums|Fuzz Guitar Trio|Baritone Guitar + Bass + Floor-Tom Drums|"
        "Piano + Organ + Bass + Soul Drums|Rhodes + Electric Bass + Pocket Drums|Clavinet + Horn Section + Funk Rhythm Section|"
        "Acoustic Guitar + Mandolin + Upright Bass|Banjo + Fiddle + Upright Bass + Stomp|Pedal Steel + Telecaster + Country Rhythm Section|"
        "Nylon Guitar + Hand Percussion + Upright Bass|Dembow Drums + Sub Bass + Bright Synth Plucks|"
        "Afrobeats Guitars + Shakers + Bass + Horns|Amapiano Log Drum + Airy Keys + Percussion|"
        "Dub Bass + Skank Guitar + Organ + Live Drums|Dancehall Drums + Sub Bass + Digital Stabs|"
        "Boom-Bap Drums + Chopped Soul Samples + Bass|Dusty Jazz Samples + Upright Bass + MPC Drums|"
        "Sliding 808 + Sparse Piano + Drill Drums|Distorted 808 + Rage Synths + Trap Drums|"
        "Analog Polysynths + Drum Machine + Electric Bass|FM Synths + Gated Drums + Chorus Guitar|"
        "House Piano + Disco Bass + Four-on-the-Floor Drums|Techno Kick + Rumble Bass + Modular Sequencers|"
        "Trance Supersaws + Arpeggiator + Rolling Bass|Jungle Breaks + Dub Sub + Atmospheric Pads|"
        "DnB Breaks + Reese Bass + Vocal Pads|Dubstep Sub + Wobble Bass + Cinematic Impacts|"
        "String Quartet + Solo Piano|Full Orchestra + Choir + Taiko|Brass Ensemble + Low Strings + Hybrid Percussion|"
        "Prepared Piano + Drones + Chamber Strings|Jazz Piano Trio|Saxophone + Piano + Upright Bass + Brushes|"
        "Big Band Brass + Reeds + Rhythm Section|Blues Guitar + Hammond Organ + Shuffle Rhythm Section|"
        "Solo Voice + Piano|Solo Voice + Acoustic Guitar|A Cappella Vocal Ensemble|Turntables + Beatbox + Bass Synth",
        "Build a practical arrangement around {name}, leaving frequency, rhythmic and dynamic space for the lead.",
    ),
    "07_production_style.csv": themed(
        "Dry Intimate Vocal Booth|Warm 1970s Tape Studio|Bright 1980s Digital Studio|Punchy 1990s Alternative Mix|"
        "Glossy 2000s Pop-Rock Mix|Modern Loud Rock Master|Natural Rehearsal-Room Recording|Wide Arena Live Sound|"
        "Raw Garage Four-Track|Dense Wall-of-Sound Production|Minimal Bedroom Recording|Polished Streaming Pop Master|"
        "Vocal-Forward R&B Mix|Deep Pocket Neo-Soul Mix|Dusty Boom-Bap Mix|Clean Modern Trap Mix|"
        "Cold Spacious Drill Mix|Distorted Rage-Rap Master|Analog Disco Sheen|Tight Dry Funk Mix|"
        "Dubwise Tape Echo and Spring Reverb|Warm Lovers-Rock Mix|Crisp Afrobeats Radio Mix|Sub-Heavy Amapiano Club Mix|"
        "Open-Air Festival Dance Mix|Dark Warehouse Techno Mix|Hypnotic Minimal Club Mix|Euphoric Trance Panorama|"
        "Soundsystem Jungle Pressure|Clean Liquid DnB Mix|Aggressive Neurofunk Master|Deep UK Dubstep Space|"
        "Retro Synthwave Cinema Mix|Cold Industrial Machine Mix|Soft Dream-Pop Haze|Dense Shoegaze Wash|"
        "Natural Jazz Club Recording|Vintage Mono Soul Recording|Modern Country Radio Mix|Rustic Americana Live Mix|"
        "Concert-Hall Orchestra|Close-Miked Chamber Ensemble|Massive Hybrid Trailer Mix|Minimalist Film-Score Space|"
        "Immersive Dark Ambient Field|Theatrical Cast-Recording Mix|A Cappella Studio Stack",
        "Mix with a {name} character, controlling vocal placement, low end, transients, depth, width and saturation deliberately.",
    ),
    "08_bpm_tempo.csv": [
        ("58 BPM Intimate Ballad", "58 BPM with patient ballad phrasing and generous breath."),
        ("72 BPM Slow R&B", "72 BPM with a deep relaxed R&B pocket."),
        ("88 BPM Laid-Back Groove", "88 BPM with unhurried head-nod movement."),
        ("98 BPM Pop Midtempo", "98 BPM with steady modern pop momentum."),
        ("108 BPM Dancehall", "108 BPM with buoyant dancehall movement."),
        ("112 BPM Afrobeats", "112 BPM with layered syncopation and light-footed bounce."),
        ("118 BPM Nu-Disco", "118 BPM with smooth four-on-the-floor disco drive."),
        ("126 BPM Club House", "126 BPM with focused peak-hour house energy."),
        ("132 BPM Hard Techno", "132 BPM with firm warehouse propulsion."),
        ("140 BPM Grime / Dubstep", "140 BPM with a spacious half-time bass-music feel."),
        ("155 BPM Hardcore", "155 BPM with urgent live-band attack."),
        ("172 BPM Jungle", "172 BPM with rolling chopped-break momentum."),
    ],
    "09_song_structure.csv": themed(
        "Verse-Pre-Chorus-Chorus Pop|Chorus-First Streaming Pop|Two-Verse Rock Anthem|Three-Verse Story Song|"
        "Quiet-Loud Alternative Arc|Intro-Riff-Verse-Chorus-Solo|Emo Build to Final Scream|Punk Sprint|"
        "Metal Clean-Chorus and Breakdown|Progressive Multi-Movement Suite|Girl-Group Member Trade-Off|"
        "K-Pop Multi-Section Switch-Up|R&B Verse-Pre-Hook-Slow Bridge|Rap Three-Verse Cypher|"
        "Rap Verse-Hook-Guest Verse|House DJ-Friendly Extended Mix|Techno Long-Form Peak Arc|"
        "Trance Breakdown and Final Lift|Jungle Two-Drop Structure|Cinematic Theme-Conflict-Resolution",
        "Arrange as {name}, with clear section functions, controlled pacing and an earned final payoff.",
    ),
    "10_hook_style.csv": themed(
        "Instant Title Earworm|Soaring Arena Chorus|Tight Girl-Group Unison Hook|Stacked R&B Harmony Hook|"
        "Duet Call-and-Answer Hook|Lead-and-Choir Gospel Hook|Crowd Shout Hook|Whispered Intimate Refrain|"
        "Falsetto Release Hook|Big Belted Pop Hook|Raspy Rock Sing-Along|Pop-Punk Gang Chorus|"
        "Clean Metal Anthem Chorus|Breakdown Vocal Callout|Melodic Rap Hook|Minimal Repeated Rap Phrase|"
        "Sample-Chop Vocal Hook|Bassline-Led Dance Hook|Build-and-Drop Payoff|Instrumental Guitar Motif|"
        "Piano Motif Refrain|Wordless Vocalise Hook|Late Final-Chorus Key Lift|No Chorus — Evolving Refrain",
        "Make the central payoff a {name}: distinct, repeatable, performable and proportionate to the song.",
    ),
    "11_themes.csv": themed(
        "New Love with Doubt|Long-Distance Relationship|Mutual Breakup|Toxic Attraction|Jealousy and Insecurity|"
        "Friendship Breakup|Chosen Family|Parent and Child|Sibling Bond|Growing Older|Coming of Age|"
        "Starting Over|Creative Burnout|Impostor Syndrome|Body Confidence|Queer Joy|Nightlife and Escape|"
        "Road-Trip Freedom|Hometown Nostalgia|Leaving a Small Town|Work and Survival|Class Ambition|"
        "Fame versus Privacy|Online Persona|Climate Anxiety|Community Resistance|Faith in Crisis|"
        "Forgiveness without Reunion|Revenge Fantasy|Mystery and Suspicion|Science-Fiction Romance",
        "Explore {name} through specific images, a coherent point of view, emotional progression and a memorable thesis.",
    ),
    "12_explicitness.csv": [
        ("Adult but Non-Graphic", "Use mature adult language and situations without graphic sexual detail."),
        ("Profane but Non-Sexual", "Use frequent natural profanity while avoiding sexual explicitness."),
    ],
    "13_aggression.csv": themed(
        "Feather-Light|Tender but Building|Steady Mid-Level Drive|Confident and Punchy|High-Energy Celebration|"
        "Controlled Fury|Sudden Explosive Peaks|Full-Throttle Live Band|Club Peak Intensity|Cinematic Crescendo",
        "Use {name} intensity, shaping vocal force, drum impact, density, distortion and section-to-section dynamics.",
    ),
    "14_darkness.csv": themed(
        "Radiant|Hopeful with Shadows|Bittersweet|Smoky Late-Night|Gothic Romantic|Psychological Tension|"
        "Dystopian|Cosmic Dread|Horror with Release",
        "Set the emotional darkness to {name} through harmony, timbre, imagery, space and the ending.",
    ),
    "15_rhyme_density.csv": themed(
        "Almost No Rhyme|Occasional Natural Rhyme|Simple Singable End Rhymes|Regular Pop Rhyme Scheme|"
        "Dense Internal Rhymes|Multisyllabic Rap Chains|Slant-Rhyme Heavy|Assonance and Consonance|"
        "Hook Simple, Verses Technical|Story Clarity over Rhyme",
        "Use {name}, preserving natural stress, intelligibility, melodic phrasing and believable speech.",
    ),
    "16_wordplay.csv": themed(
        "Everyday Conversational Language|Concrete Sensory Detail|Recurring Image Motif|Extended Central Metaphor|"
        "Sharp One-Line Quotables|Dense Double Meanings|Playful Flirtation|Dry Wit and Irony|"
        "Cinematic Symbolism|Technical Rap Punchlines|Character-Specific Vocabulary|No-Frills Direct Writing",
        "Use {name} as the main writing device without sacrificing emotional clarity or singability.",
    ),
    "17_storytelling.csv": themed(
        "Diary Confession|Letter to One Person|Single-Night Timeline|Road-Movie Journey|Rise-Fall-Recovery Arc|"
        "Two Singers, Two Perspectives|Group Members Trade Viewpoints|Scene and Flashback Alternation|"
        "Mystery Reveal at the End|Open Ending|Generational Family Story|Fictional Character Study",
        "Tell the song as {name}, keeping point of view, chronology, scene detail and the final turn clear.",
    ),
    "18_adlibs.csv": themed(
        "No Ad-Libs|Very Sparse Breath Accents|Soft Echoed Last Words|Female Trio Responses|Male Trio Responses|"
        "Girl-Group Member Callouts|Duet Answer Phrases|Choir Amen Responses|Crowd Hey Shouts|Gang-Vocal Replies|"
        "Rap Crew Hype Layers|Whispered Side Comments|Melodic R&B Runs between Lines|Dancehall Sound-System Calls|"
        "Rock Whoa-Oh Crowd Vocals",
        "Use {name} selectively, keeping every extra phrase short, section-aware and clear of the lead line.",
    ),
    "19_song_length.csv": [
        ("About 105 Seconds", "Target about one minute forty-five seconds with an immediate hook and compact bridge.", "105"),
        ("About 135 Seconds", "Target about two minutes fifteen seconds with two concise vocal movements.", "135"),
        ("About 195 Seconds", "Target about three minutes fifteen seconds with room for a bridge or solo.", "195"),
        ("About 255 Seconds", "Target about four minutes fifteen seconds with developed sections and a full ending.", "255"),
    ],
}


def profile(name: str, folder: str, base: str, genre: str, style: str, delivery: str,
            voice: str, instruments: str, production: str, artists: str) -> dict[str, object]:
    return {
        "name": name, "folder": folder, "base": base, "genre": genre, "style": style,
        "delivery": delivery, "voice": voice, "instruments": instruments,
        "production": production, "artists": split_words(artists),
    }


ARTIST_PROFILES = [
    profile("female_grunge", "Artist References / Female-Fronted Rock & Alternative", "Alternative Rock Catharsis", "Alternative Rock", "90s Alternative Rock", "Loose Grunge Phrasing", "Mature Smoky Female Lead", "Grunge Guitars + Bass + Loose Live Drums", "Punchy 1990s Alternative Mix", "Garbage|Hole|The Cranberries|Veruca Salt|L7"),
    profile("female_punk", "Artist References / Female-Fronted Rock & Alternative", "Pop-Punk Summer", "Punk", "90s Riot Grrrl", "Short Punk Bark", "Female Lead + Backing Trio", "Pop-Punk Guitars + Bass + Punchy Drums", "Raw Garage Four-Track", "Bikini Kill|Sleater-Kinney|The Warning|Halestorm|PVRIS"),
    profile("female_alt", "Artist References / Female-Fronted Rock & Alternative", "Alternative Rock Catharsis", "Alternative Rock", "Modern Art Rock", "Gritty Rock Shout", "Alto Female Lead", "Electric Guitar + Bass + Live Drums", "Modern Loud Rock Master", "Evanescence|No Doubt|Florence + The Machine|Wolf Alice|The Pretty Reckless|Yeah Yeah Yeahs|PJ Harvey|Alanis Morissette|Liz Phair|St. Vincent|Flyleaf"),
    profile("female_indie", "Artist References / Female-Fronted Rock & Alternative", "Ethereal Dream Pop", "Indie Rock", "2010s Bedroom Pop", "Indie Deadpan", "Youthful Female Lead", "Clean Jangle Guitar + Bass + Live Drums", "Minimal Bedroom Recording", "Wet Leg|Soccer Mommy|Snail Mail|Japanese Breakfast"),
    profile("pop_power", "Artist References / Pop & Singer-Songwriter", "Bright Radio Pop", "Dance-Pop", "Modern Dance-Pop", "Big Belted Pop Chorus", "Bright Soprano Lead", "Analog Polysynths + Drum Machine + Electric Bass", "Polished Streaming Pop Master", "Chappell Roan|Lady Gaga|Rihanna|Ariana Grande|Katy Perry|Miley Cyrus|Demi Lovato|P!nk|Kelly Clarkson|Christina Aguilera|Britney Spears|Cyndi Lauper"),
    profile("pop_modern", "Artist References / Pop & Singer-Songwriter", "Bright Radio Pop", "Pop", "Modern Art Pop", "Clean Controlled Pop", "Youthful Female Lead", "Synths + 808 Bass + Trap Drums", "Polished Streaming Pop Master", "Olivia Rodrigo|Sabrina Carpenter|Tate McRae|Gracie Abrams|Halsey|Selena Gomez"),
    profile("alt_pop", "Artist References / Pop & Singer-Songwriter", "Ethereal Dream Pop", "Art Pop", "Modern Dark Pop", "Breath-Heavy Seductive Delivery", "Deep Contralto Lead", "Analog Polysynths + Drum Machine + Electric Bass", "Minimal Bedroom Recording", "SZA|Doja Cat|Charli XCX|Lana Del Rey|Lorde|Kesha|Robyn"),
    profile("western_girl_groups", "Artist References / Girl Groups & Vocal Groups", "Bright Radio Pop", "Girl Group Pop", "60s Girl-Group Pop", "Tight Synchronized Group Delivery", "Girl Group — Stacked Pop Vocals", "Piano + Organ + Bass + Soul Drums", "Polished Streaming Pop Master", "Spice Girls|Destiny's Child|TLC|Little Mix|Fifth Harmony|Sugababes|Girls Aloud|The Pussycat Dolls"),
    profile("kpop_groups", "Artist References / K-Pop J-Pop & Asian Pop", "Bright Radio Pop", "K-Pop", "Fourth-Generation K-Pop", "Girl-Group Call and Response", "Girl Group — Tight Harmonies", "Synths + 808 Bass + Trap Drums", "Polished Streaming Pop Master", "BLACKPINK|NewJeans|TWICE|aespa|LE SSERAFIM|XG|Red Velvet|ITZY|IVE|NMIXX|BABYMONSTER|(G)I-DLE"),
    profile("jpop_groups", "Artist References / K-Pop J-Pop & Asian Pop", "Bright Radio Pop", "J-Pop", "Japanese Idol Pop", "Tight Synchronized Group Delivery", "Girl Group — Stacked Pop Vocals", "FM Synths + Gated Drums + Chorus Guitar", "Bright 1980s Digital Studio", "Perfume|AKB48|Babymetal|Atarashii Gakko!|f5ve"),
    profile("classic_rock", "Artist References / Classic & Modern Rock", "Alternative Rock Catharsis", "Classic Rock", "70s Classic Rock", "Gritty Rock Shout", "Baritone Storyteller", "Two Electric Guitars + Bass + Arena Drums", "Warm 1970s Tape Studio", "The Rolling Stones|The Beatles|The Who|The Doors|Creedence Clearwater Revival|Aerosmith|Van Halen|Bon Jovi|Journey|Def Leppard|Scorpions|Deep Purple|Thin Lizzy|ZZ Top|The Black Crowes"),
    profile("modern_rock", "Artist References / Classic & Modern Rock", "Alternative Rock Catharsis", "Rock", "2000s Garage Revival", "Raspy Rock Belt", "Male Lead + Backing Trio", "Electric Guitar + Bass + Live Drums", "Modern Loud Rock Master", "Kings of Leon|The Killers|The Strokes|Franz Ferdinand|The White Stripes|The Hives|Royal Blood|Nothing But Thieves|Greta Van Fleet|Rival Sons"),
    profile("brit_indie", "Artist References / Indie Britpop & Post-Punk", "Alternative Rock Catharsis", "Britpop", "90s Britpop", "Indie Deadpan", "Baritone Storyteller", "Clean Jangle Guitar + Bass + Live Drums", "Punchy 1990s Alternative Mix", "Blur|Pulp|Suede|The Verve|The Stone Roses|The Smiths"),
    profile("postpunk", "Artist References / Indie Britpop & Post-Punk", "Alternative Rock Catharsis", "Post-Punk", "2000s Post-Punk Revival", "Coldly Controlled Vocal", "Deep Male Lead", "Baritone Guitar + Bass + Floor-Tom Drums", "Cold Industrial Machine Mix", "Joy Division|New Order|Interpol|Editors|Bloc Party"),
    profile("us_indie", "Artist References / Indie Britpop & Post-Punk", "Ethereal Dream Pop", "Indie Rock", "90s Slacker Indie", "Indie Deadpan", "Androgynous Lead", "Clean Jangle Guitar + Bass + Live Drums", "Minimal Bedroom Recording", "The National|Arcade Fire|Modest Mouse|Pixies|R.E.M.|Pavement|The War on Drugs|Tame Impala|MGMT"),
    profile("classic_metal", "Artist References / Metal Punk & Hardcore", "Classic Heavy Metal", "Metal", "80s NWOBHM", "Clean Metal Chorus", "Male Lead + Backing Trio", "Heavy Guitars + Bass + Double-Kick Drums", "Wide Arena Live Sound", "Judas Priest|Megadeth|Slayer|Anthrax|Pantera"),
    profile("alt_metal", "Artist References / Metal Punk & Hardcore", "Classic Heavy Metal", "Nu Metal", "90s Alternative Metal", "Gritty Rock Shout", "Deep Male Lead", "Heavy Guitars + Bass + Double-Kick Drums", "Modern Loud Rock Master", "Tool|System of a Down|Korn|Deftones|Avenged Sevenfold|Disturbed"),
    profile("prog_metal", "Artist References / Metal Punk & Hardcore", "Metalcore Breakdown", "Progressive Metal", "Modern Progressive Metal", "Clean Metal Chorus", "Baritone Storyteller", "Heavy Guitars + Bass + Double-Kick Drums", "Modern Loud Rock Master", "Lamb of God|Gojira|Mastodon|Opeth|Nightwish|Within Temptation"),
    profile("modern_core", "Artist References / Metal Punk & Hardcore", "Metalcore Breakdown", "Metalcore", "2000s Metalcore", "High Metal Scream", "Mixed-Gender Duet — Trading Leads", "Heavy Guitars + Bass + Double-Kick Drums", "Modern Loud Rock Master", "Spiritbox|Architects|Bad Omens"),
    profile("punk_alt", "Artist References / Metal Punk & Hardcore", "Pop-Punk Summer", "Pop-Punk", "90s Pop-Punk", "Pop-Punk Snarl and Lift", "Male Lead + Backing Trio", "Pop-Punk Guitars + Bass + Punchy Drums", "Glossy 2000s Pop-Rock Mix", "Rise Against|The Offspring|Sum 41|Fall Out Boy|Turnstile"),
    profile("boom_bap", "Artist References / Hip-Hop Rap & Regional", "Golden Era Boom Bap", "Boom Bap", "90s East Coast Boom Bap", "Detailed Narrative Rap", "Rap Duo", "Boom-Bap Drums + Chopped Soul Samples + Bass", "Dusty Boom-Bap Mix", "Jay-Z|J. Cole|Lauryn Hill|Missy Elliott|Lil' Kim|Salt-N-Pepa|Run-D.M.C.|Public Enemy|A Tribe Called Quest|De La Soul|Busta Rhymes|Method Man|Redman|MF DOOM"),
    profile("west_south_rap", "Artist References / Hip-Hop Rap & Regional", "West Coast G-Funk Cruise", "Hip-Hop / Rap", "90s West Coast G-Funk", "Conversational Rap Storytelling", "Rap Crew / Posse Vocal", "Boom-Bap Drums + Chopped Soul Samples + Bass", "Warm 1970s Tape Studio", "N.W.A.|Ice Cube|Dr. Dre|50 Cent|DMX|Kanye West|Lil Wayne"),
    profile("modern_trap", "Artist References / Hip-Hop Rap & Regional", "Heavy Rap / Trap / Drill", "Trap", "Melodic Trap", "Melodic Rap and Sung Hook", "Deep Male Lead", "Synths + 808 Bass + Trap Drums", "Clean Modern Trap Mix", "Nicki Minaj|Cardi B|Megan Thee Stallion|Tyler, the Creator|Childish Gambino|Mac Miller|Juice WRLD|XXXTentacion|Lil Uzi Vert|21 Savage|Metro Boomin|Chief Keef|Lil Durk"),
    profile("uk_rap", "Artist References / Hip-Hop Rap & Regional", "UK Drill Pressure", "Grime", "Modern UK Grime", "Aggressive Rap Attack", "Deep Male Lead", "Sliding 808 + Sparse Piano + Drill Drums", "Cold Spacious Drill Mix", "Stormzy"),
    profile("classic_soul", "Artist References / R&B Soul Funk & Disco", "Acoustic Soul Storyteller", "Soul", "60s Motown Soul", "Soulful Runs and Melisma", "Soul Trio", "Piano + Organ + Bass + Soul Drums", "Vintage Mono Soul Recording", "Stevie Wonder|Al Green|Otis Redding|Sam Cooke|Donny Hathaway|Luther Vandross|Anita Baker|Chaka Khan|Diana Ross|The Supremes"),
    profile("funk", "Artist References / R&B Soul Funk & Disco", "P-Funk Mothership", "Funk", "70s P-Funk", "Funky Rhythmic Vocal", "Call-and-Response Group", "Clavinet + Horn Section + Funk Rhythm Section", "Tight Dry Funk Mix", "Earth, Wind & Fire|Kool & the Gang|Parliament-Funkadelic|Rick James"),
    profile("modern_rnb", "Artist References / R&B Soul Funk & Disco", "Contemporary R&B Night", "Alternative R&B", "2010s Alternative R&B", "Silky R&B Lead", "Alto Female Lead", "Rhodes + Electric Bass + Pocket Drums", "Vocal-Forward R&B Mix", "Jill Scott|Maxwell|Alicia Keys|Usher|Mary J. Blige|Aaliyah|Brandy|Monica|Jhené Aiko|Summer Walker|Giveon"),
    profile("electronic_pioneers", "Artist References / Electronic & Club", "Cinematic Synthwave", "Electronic", "70s Berlin-School Electronic", "Vocoder Lead with Human Doubles", "Androgynous Lead", "Analog Polysynths + Drum Machine + Electric Bass", "Retro Synthwave Cinema Mix", "Kraftwerk|Tangerine Dream|Jean-Michel Jarre|Giorgio Moroder"),
    profile("bigbeat", "Artist References / Electronic & Club", "Industrial Dark Techno", "Breakbeat", "90s Big Beat", "Aggressive Rap Attack", "Spoken Male Lead", "Techno Kick + Rumble Bass + Modular Sequencers", "Open-Air Festival Dance Mix", "The Chemical Brothers|Fatboy Slim|Underworld|Orbital|Moby"),
    profile("electro", "Artist References / Electronic & Club", "Cinematic Synthwave", "Electronic", "2000s French Electro", "Vocoder Lead with Human Doubles", "Androgynous Lead", "Analog Polysynths + Drum Machine + Electric Bass", "Cold Industrial Machine Mix", "Röyksopp|Justice|Gesaffelstein|Kavinsky|Carpenter Brut|Perturbator"),
    profile("future_electronic", "Artist References / Electronic & Club", "Deep House Sunset", "Electronic", "Modern Organic Electronica", "Ethereal Layered Vocal", "Androgynous Lead", "House Piano + Disco Bass + Four-on-the-Floor Drums", "Open-Air Festival Dance Mix", "Flume|Disclosure|Fred again..|Four Tet|Bicep|Bonobo"),
    profile("idm_bass", "Artist References / Electronic & Club", "Dark Ambient Void", "IDM", "90s Intelligent Techno", "Instrumental - No Vocals", "Instrumental / No Lead Vocal", "DnB Breaks + Reese Bass + Vocal Pads", "Aggressive Neurofunk Master", "Boards of Canada|Autechre|Squarepusher|Noisia"),
    profile("classic_country", "Artist References / Country Folk & Americana", "Modern Country Road", "Country", "80s Neo-Traditional Country", "Country Conversational Twang", "Baritone Storyteller", "Pedal Steel + Telecaster + Country Rhythm Section", "Modern Country Radio Mix", "Willie Nelson|Waylon Jennings|Merle Haggard|Loretta Lynn|Patsy Cline|Reba McEntire|Garth Brooks|George Strait|Alan Jackson"),
    profile("americana", "Artist References / Country Folk & Americana", "Appalachian Folk Tale", "Americana", "Modern Americana", "Country Conversational Twang", "Three-Part Harmony Group", "Acoustic Guitar + Mandolin + Upright Bass", "Rustic Americana Live Mix", "Kacey Musgraves|Zach Bryan|Tyler Childers|Jason Isbell|Brandi Carlile|Noah Kahan"),
    profile("roots_reggae", "Artist References / Reggae Latin Afro & Global", "Roots Reggae Reflection", "Reggae / Dancehall", "70s Roots Reggae", "Reggae Toasting", "Male Lead + Backing Trio", "Dub Bass + Skank Guitar + Organ + Live Drums", "Dubwise Tape Echo and Spring Reverb", "Peter Tosh|Jimmy Cliff|Toots and the Maytals|Damian Marley|Shaggy"),
    profile("afro", "Artist References / Reggae Latin Afro & Global", "Afrobeat Golden Hour", "Afrobeats", "Nigerian Afrobeats", "Funky Rhythmic Vocal", "Call-and-Response Group", "Afrobeats Guitars + Shakers + Bass + Horns", "Crisp Afrobeats Radio Mix", "Wizkid|Davido|Tems|Rema|Tyla"),
    profile("latin", "Artist References / Reggae Latin Afro & Global", "Reggaeton Neon", "Latin / Reggaeton", "Modern Reggaeton", "Dance-Pop Club Vocal", "Male/Female Duet", "Dembow Drums + Sub Bass + Bright Synth Plucks", "Polished Streaming Pop Master", "Karol G|J Balvin|Daddy Yankee|Rosalía|Shakira"),
    profile("jazz", "Artist References / Jazz Blues Cinematic & Vocal", "Late-Night Jazz Club", "Jazz", "50s Hard Bop", "Jazz Torch-Song Phrasing", "Mature Smoky Female Lead", "Saxophone + Piano + Upright Bass + Brushes", "Natural Jazz Club Recording", "Duke Ellington|Thelonious Monk|Charlie Parker|Ella Fitzgerald|Billie Holiday|Nina Simone|Sarah Vaughan|Chet Baker"),
    profile("blues", "Artist References / Jazz Blues Cinematic & Vocal", "Chicago Blues Confession", "Blues", "Chicago Electric Blues", "Raspy Blues Delivery", "Baritone Storyteller", "Blues Guitar + Hammond Organ + Shuffle Rhythm Section", "Natural Rehearsal-Room Recording", "Muddy Waters|Howlin' Wolf|Etta James|Ray Charles"),
    profile("cinematic", "Artist References / Jazz Blues Cinematic & Vocal", "Epic Trailer Last Stand", "Film Score", "Modern Hybrid Trailer", "Choir-Only Performance", "Large Gospel Choir", "Full Orchestra + Choir + Taiko", "Massive Hybrid Trailer Mix", "Danny Elfman|Howard Shore|Two Steps from Hell"),
]


def append_rows(path: Path, rows: list[tuple[str, ...]]) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        existing = list(reader)
    names = {str(row.get("name", "")).strip() for row in existing}
    added = 0
    for values in rows:
        if not values or values[0] in names:
            continue
        row = {key: "" for key in fieldnames}
        row["name"] = values[0]
        row["prompt"] = values[1]
        if len(values) > 2 and "duration_seconds" in row:
            row["duration_seconds"] = values[2]
        existing.append(row)
        names.add(values[0])
        added += 1
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(existing)
    return added


def append_artists() -> int:
    path = CATALOG / "21_reference_presets.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    existing_names = {str(row.get("name", "")).strip() for row in rows}
    existing_artists = {str(row.get("reference", "")).strip() for row in rows if row.get("reference")}
    all_new = [artist for item in ARTIST_PROFILES for artist in item["artists"]]
    assert len(all_new) == 275, f"Expected 275 curated artists, got {len(all_new)}"
    assert len(set(all_new)) == len(all_new), "v4.6.4 artist list contains a duplicate"
    overlap = sorted(set(all_new) & existing_artists)
    unexpected = [
        artist for artist in overlap
        if f"{artist} - Curated v4.6.4 Reference" not in existing_names
    ]
    assert not unexpected, f"Artist names collide with a non-v4.6.4 row: {unexpected}"
    added = 0
    for item in ARTIST_PROFILES:
        for artist in item["artists"]:
            legacy_name = f"{artist} - Curated v4.6.4 Reference"
            if legacy_name in existing_names:
                continue
            row = {key: "" for key in fieldnames}
            row.update({
                "name": legacy_name,
                "folder": item["folder"],
                "reference": artist,
                "keywords": f"{artist} {item['genre']} {item['style']} {item['name']}",
                "description": (
                    f"A searchable {artist} reference translated into artist-neutral descriptive DNA for "
                    f"{item['style']}; the artist name remains UI metadata and is never sent to the writer."
                ),
                "base_preset": item["base"],
                "genre": item["genre"],
                "subgenre_era": item["style"],
                "vocal_delivery": item["delivery"],
                "vocal_gender_type": item["voice"],
                "instruments": item["instruments"],
                "production_style": item["production"],
            })
            rows.append(row)
            existing_names.add(legacy_name)
            added += 1
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return added


def main() -> int:
    deltas = {}
    for filename, rows in ADDITIONS.items():
        deltas[filename] = append_rows(CATALOG / filename, rows)
    artists_added = append_artists()
    genre_style_added = deltas["01_genre.csv"] + deltas["02_subgenre_era.csv"]
    if genre_style_added and genre_style_added < 250:
        raise RuntimeError(f"Expected at least 250 new genre/style values, added {genre_style_added}")
    if artists_added not in {0, 275}:
        raise RuntimeError(f"Expected 275 new artist rows, added {artists_added}")
    print(f"v4.6.4 genre/style additions: {genre_style_added}")
    print(f"v4.6.4 named artists added: {artists_added}")
    for filename, count in deltas.items():
        print(f"{filename}: +{count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

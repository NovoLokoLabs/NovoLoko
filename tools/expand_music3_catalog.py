"""Expand the built-in MiniMax Music 3 CSV catalog without replacing user data."""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "csv" / "music3"


def themed(names, template):
    return [(name, template.format(name=name)) for name in names]


ADDITIONS = {
    "01_genre.csv": themed(
        [
            "Country", "Blues", "Funk", "Latin / Reggaeton", "Afrobeat / Afropop",
            "Gospel", "Punk", "Ambient", "Classical", "Experimental", "World Fusion",
            "Disco", "House", "Techno", "Trance", "Drum and Bass / Jungle",
            "Dubstep / Bass Music", "Lo-Fi", "Vaporwave", "Shoegaze",
        ],
        "Build the song around {name} conventions with an authentic rhythmic identity, harmonic language, arrangement, and performance character.",
    ),
    "02_subgenre_era.csv": themed(
        [
            "UK Drill", "Brooklyn Drill", "Chicago Drill", "90s Boom Bap", "Jazz Rap",
            "Rage Rap", "G-Funk", "Drumless Luxury Rap", "Jersey Club Rap", "Memphis Phonk",
            "Contemporary R&B", "90s R&B", "Neo-Soul", "New Jack Swing", "Synth Pop",
            "Hyperpop", "City Pop", "Alternative Rock", "Grunge", "Shoegaze",
            "Pop Punk", "Hardcore Punk", "Post-Punk", "Heavy Metal", "Thrash Metal",
            "Metalcore", "Deathcore", "Industrial Metal", "Progressive Metal", "Detroit Techno",
            "Berlin Techno", "Melodic Techno", "Deep House", "Progressive House", "Piano House",
            "UK Garage", "Future Bass", "Uplifting Trance", "Psytrance", "Liquid Drum and Bass",
            "Neurofunk Drum and Bass", "Jungle", "Brostep Dubstep", "Deep Dubstep", "Wave Phonk",
            "Drift Phonk", "Dark Ambient", "Horror Score", "Epic Trailer Hybrid", "Bebop Jazz",
            "Cool Jazz", "Jazz Fusion", "P-Funk", "Chicago Blues", "Delta Blues",
            "Modern Country", "Outlaw Country", "Appalachian Folk", "Indie Folk", "Roots Reggae",
            "Modern Dancehall", "Reggaeton", "Latin Pop", "Afrobeat", "Amapiano",
            "Gospel Choir", "Lo-Fi Hip-Hop", "Vaporwave", "Opera Rock", "Gregorian Drill Opera",
        ],
        "Use a clear {name} vocabulary: genre-authentic groove, sound palette, phrasing, transitions, and era-aware production detail.",
    ),
    "03_mood.csv": themed(
        [
            "Euphoric", "Bittersweet", "Romantic", "Heartbroken", "Hopeful", "Nostalgic",
            "Meditative", "Eerie", "Apocalyptic", "Heroic", "Rebellious", "Playful",
            "Seductive", "Lonely", "Angry", "Peaceful", "Spiritual", "Celebratory",
            "Suspenseful", "Dreamlike", "Melancholic", "Chaotic", "Dark to Triumphant", "Warm and Intimate",
            "Cold and Mechanical", "Cosmic and Awe-Struck",
        ],
        "Maintain a {name} emotional arc in the harmony, dynamics, vocal color, imagery, and section-to-section intensity.",
    ),
    "04_vocal_delivery.csv": themed(
        [
            "Conversational Rap", "Boom Bap Pocket", "Rapid Triplet Flow", "Whisper Rap",
            "Rage Shouts", "Smooth R&B Croon", "Neo-Soul Runs", "Power Pop Belt",
            "Breathy Indie Singing", "Raspy Rock Belt", "Pop-Punk Snarl", "Metalcore Scream and Clean",
            "Death Growls", "Operatic Lead", "Gospel Call and Response", "Dancehall Toasting",
            "Reggaeton Sing-Rap", "Afrobeat Melodic Phrasing", "Jazz Scat", "Country Storytelling Twang",
            "Folk Harmony Lead", "Spoken Word", "Robotic Vocoder", "Choir-Only Performance",
            "Instrumental - No Vocals",
        ],
        "Use {name} with genre-appropriate articulation, breath, dynamics, rhythmic placement, and supporting layers.",
    ),
    "05_vocal_gender_type.csv": themed(
        [
            "Warm Male Tenor", "Male Falsetto Lead", "Female Alto Lead", "Female Soprano Lead",
            "Androgynous Airy Lead", "Mixed-Gender Duet", "Male Rap and Female Hook",
            "Female Rap and Male Hook", "Youthful Pop Ensemble", "Mature Storyteller",
            "Small Gospel Choir", "Massive Mixed Choir", "Monastic Male Choir", "Children's Choir Texture",
            "Synthetic AI Vocal", "Vocoder Ensemble", "Instrumental / No Lead Vocal",
        ],
        "Feature {name} as the vocal identity, with suitable doubles, harmonies, responses, and register management.",
    ),
    "06_instruments.csv": themed(
        [
            "Sliding 808s and Sparse Piano", "Boom Bap Drums and Jazz Samples", "Rage Synths and Distorted 808s",
            "G-Funk Leads and Live Bass", "Rhodes, Bass and Neo-Soul Guitar", "Grand Piano and String Quartet",
            "Acoustic Guitar, Mandolin and Fiddle", "Banjo, Stomp and Upright Bass", "Telecaster, Pedal Steel and Drums",
            "Blues Guitar, Hammond Organ and Shuffle Drums", "Horn Section, Clavinet and Slap Bass",
            "Reggae Skank Guitar and Dub Bass", "Dancehall Drums and Digital Stabs", "Reggaeton Dembow and Nylon Guitar",
            "Afrobeat Guitars, Horns and Percussion", "Amapiano Log Drum and Airy Keys", "Gospel Organ, Piano and Choir",
            "Shoegaze Guitar Wall and Dreamy Bass", "Pop-Punk Guitars and Live Drums", "Metalcore Guitars and Double Kick",
            "Orchestral Strings, Brass and Timpani", "Horror Strings, Drones and Prepared Piano", "Modular Synths and Drum Machines",
            "Techno Kick, Rumble and Sequencers", "House Piano, Disco Bass and Claps", "Trance Supersaws and Arpeggios",
            "DnB Breakbeats, Reese Bass and Pads", "Jungle Breaks and Dub Sub", "Dubstep Wobbles and Cinematic Impacts",
            "Phonk Cowbells, Distorted Bass and Memphis Chops", "Lo-Fi Keys, Dusty Drums and Tape Noise",
            "Pipe Organ, Cathedral Choir and Sliding 808s", "Solo Piano", "Solo Acoustic Guitar",
        ],
        "Center the arrangement on {name}, leaving deliberate frequency and rhythmic space for the lead elements.",
    ),
    "07_production_style.csv": themed(
        [
            "Raw Underground Mixtape", "Warm Analog Tape", "Crisp Modern Hip-Hop", "West Coast Sunset Polish",
            "Luxurious Drumless Master", "Intimate Bedroom Pop", "Maximal Hyperpop", "Live Band Room",
            "Arena Rock Wide", "Punk Basement Live", "Metalcore Precision", "Lo-Fi Cassette",
            "Vintage Soul Vinyl", "Neo-Soul Boutique Studio", "Festival EDM Master", "Dark Club Techno",
            "Melodic Techno Cinema", "Deep House Warmth", "Trance Euphoric Wide", "DnB Club Pressure",
            "Jungle Soundsystem", "Dubstep Sub-Heavy", "Phonk Saturated", "Dub Reggae Space Echo",
            "Cinematic Trailer Hybrid", "Horror Film Soundstage", "Jazz Club Natural", "Country Radio Polish",
            "Orchestral Concert Hall", "Vaporwave Degraded Digital", "Shoegaze Haze",
        ],
        "Mix and master with a {name} aesthetic, controlling depth, saturation, stereo width, transients, low end, and vocal placement accordingly.",
    ),
    "08_bpm_tempo.csv": [
        ("55 BPM Very Slow", "55 BPM, extremely spacious and deliberate."),
        ("65 BPM Slow Burn", "65 BPM with a patient slow-burn pulse."),
        ("84 BPM Soul Pocket", "84 BPM with a relaxed soulful pocket."),
        ("96 BPM Boom Bap", "96 BPM with firm head-nod swing."),
        ("100 BPM Funk Groove", "100 BPM with tight syncopated funk movement."),
        ("105 BPM Reggaeton", "105 BPM with steady dembow momentum."),
        ("110 BPM Afrobeat", "110 BPM with layered polyrhythmic bounce."),
        ("115 BPM Disco", "115 BPM with an energetic four-on-the-floor disco pulse."),
        ("120 BPM Deep House", "120 BPM with a smooth club-ready house groove."),
        ("124 BPM House", "124 BPM with driving house energy."),
        ("128 BPM Festival", "128 BPM with high-energy festival pacing."),
        ("130 BPM Techno", "130 BPM with relentless techno propulsion."),
        ("134 BPM Trance", "134 BPM with uplifting trance drive."),
        ("138 BPM Drill", "138 BPM with a half-time drill feel and room for sliding bass."),
        ("145 BPM Rage", "145 BPM with urgent rage-rap momentum."),
        ("150 BPM Punk", "150 BPM with fast live-band attack."),
        ("160 BPM Double-Time", "160 BPM with forceful double-time energy."),
        ("170 BPM Drum and Bass", "170 BPM with rolling drum-and-bass pace."),
        ("174 BPM Liquid DnB", "174 BPM with fluid breakbeat motion."),
        ("180 BPM Jungle", "180 BPM with frantic chopped-break intensity."),
        ("Variable Rubato", "Use expressive rubato and tempo breathing instead of a rigid pulse."),
        ("Half-Time to Double-Time", "Begin in a heavy half-time feel and switch decisively into double-time."),
    ],
    "09_song_structure.csv": [
        ("Short Viral Hook", "[Hook] -> [Verse 1] -> [Hook] -> [Outro]."),
        ("Boom Bap Three Verse", "[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Verse 3] -> [Outro]."),
        ("R&B Slow Jam", "[Intro] -> [Verse 1] -> [Pre-Chorus] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Bridge] -> [Final Chorus] -> [Outro]."),
        ("Pop Immediate Chorus", "[Chorus] -> [Verse 1] -> [Pre-Chorus] -> [Chorus] -> [Verse 2] -> [Bridge] -> [Final Chorus]."),
        ("Rock Quiet Loud", "[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Breakdown] -> [Solo] -> [Final Chorus] -> [Outro]."),
        ("Metalcore Breakdown", "[Intro] -> [Verse 1] -> [Pre-Chorus] -> [Chorus] -> [Verse 2] -> [Breakdown] -> [Final Chorus] -> [Outro]."),
        ("Punk Two Minute", "[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Bridge] -> [Final Chorus]."),
        ("EDM Build and Drop", "[Intro] -> [Verse 1] -> [Build] -> [Drop] -> [Verse 2] -> [Build] -> [Final Drop] -> [Outro]."),
        ("Techno Progressive", "[Intro] -> [Groove A] -> [Build] -> [Peak] -> [Breakdown] -> [Peak Return] -> [Outro]."),
        ("Trance Journey", "[Intro] -> [Theme] -> [Build] -> [Breakdown] -> [Uplift] -> [Climax] -> [Outro]."),
        ("DnB Vocal Journey", "[Intro] -> [Verse 1] -> [Build] -> [Drop] -> [Verse 2] -> [Drop] -> [Breakdown] -> [Final Drop]."),
        ("Jazz Head Solos Head", "[Intro] -> [Head] -> [Solo 1] -> [Solo 2] -> [Head Return] -> [Outro]."),
        ("Country Story Arc", "[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Bridge] -> [Final Chorus] -> [Outro]."),
        ("Gospel Testimony", "[Intro] -> [Verse 1] -> [Choir Response] -> [Verse 2] -> [Choir Response] -> [Bridge] -> [Final Choir] -> [Outro]."),
        ("Ambient Evolution", "[Opening Texture] -> [Slow Development] -> [Central Bloom] -> [Dissolution]."),
        ("Cinematic Three Act", "[Act I] -> [Rising Conflict] -> [Act II Climax] -> [Quiet Turn] -> [Act III Finale] -> [Resolution]."),
    ],
    "10_hook_style.csv": themed(
        [
            "One-Word Chant", "Title Repetition", "Question and Answer", "Big Sung Chorus", "Soft Intimate Refrain",
            "Falsetto Lift", "Gospel Choir Response", "Gang Vocal Shout", "Pop-Punk Crowd Hook", "Metalcore Clean Chorus",
            "Drop-Centered Instrumental Hook", "Synth Riff Hook", "Guitar Riff Hook", "Bassline Hook", "Sample Chop Hook",
            "Dancehall Callout", "Reggaeton Sing-Along", "Afrobeat Circular Melody", "Jazz Motif", "No Repeated Hook",
        ],
        "Build the hook as a {name}, making its rhythm and melodic contour instantly identifiable without over-repeating it.",
    ),
    "11_themes.csv": themed(
        [
            "Self-Belief", "Underdog Victory", "Friendship", "Family Legacy", "First Love", "Breakup and Recovery",
            "Late-Night Desire", "Summer Freedom", "City Isolation", "Road Trip", "Small-Town Life", "Working-Class Pride",
            "Rebellion", "Social Pressure", "Digital Identity", "Artificial Intelligence", "Creative Obsession", "Gaming Culture",
            "Environmental Wonder", "Spiritual Awakening", "Faith and Redemption", "Mortality", "Grief and Memory",
            "Cosmic Exploration", "Ancient Myth", "Horror Pursuit", "Dystopian Resistance", "Comedy and Absurdity",
            "Dancefloor Escape", "Political Protest Fiction", "Historical Character Portrait", "Ocean and Nature",
            "Dreams and Sleep", "Fame and Burnout", "Homecoming",
        ],
        "Explore {name} through concrete images, emotional progression, and a memorable central point of view.",
    ),
    "12_explicitness.csv": themed(
        ["Family Friendly", "Clean but Intense", "Radio Edit", "Uncensored", "Comedic Explicit", "Dark Mature", "Instrumental"],
        "Apply a {name} language policy consistently while keeping the requested emotional and genre intensity.",
    ),
    "13_aggression.csv": themed(
        ["None", "Gentle", "Low Simmer", "Moderate", "Hard-Hitting", "Explosive", "Relentless", "Breakdown Peak", "Dynamic Swells"],
        "Shape the performance and production around a {name} aggression level, including articulation, drum impact, dynamics, and lyrical confrontation.",
    ),
    "14_darkness.csv": themed(
        ["Sunlit", "Warm Twilight", "Neutral", "Moody", "Noir", "Bleak", "Horror", "Abyssal", "Dark with Hope", "Bright to Dark"],
        "Use a {name} darkness level across harmony, timbre, imagery, space, and the emotional ending.",
    ),
    "15_rhyme_density.csv": themed(
        ["None / Free Verse", "Sparse End Rhyme", "Simple Couplets", "Pop Regular", "Internal Accents", "Technical Dense", "Maximum Rhyme Chains", "Variable by Section", "Melodic Repetition"],
        "Use a {name} rhyme approach while preserving natural stress, clarity, and performability.",
    ),
    "16_wordplay.csv": themed(
        ["Plainspoken", "Visual Metaphor", "Extended Metaphor", "Double Entendres", "Triple Entendres", "Battle-Rap Punchlines", "Story-First", "Surreal Imagery", "Comedic Bars", "Technical References", "Poetic Symbolism", "Minimal Lyrics"],
        "Use {name} as the dominant wordplay method without sacrificing the song's emotional through-line.",
    ),
    "17_storytelling.csv": themed(
        ["No Narrative", "Single Moment", "Vignette Chain", "Three-Act Story", "Unreliable Narrator", "Dual Perspective", "Dialogue Scene", "Reverse Chronology", "Circular Ending", "Concept Album Chapter", "Documentary Detail", "Mythic Allegory"],
        "Use a {name} storytelling design with clear perspective, specific scenes, progression, and a satisfying final turn.",
    ),
    "18_adlibs.csv": themed(
        ["Completely Dry", "Whispered Echoes", "Crew Responses", "Call-and-Response", "Comedic Reactions", "Rage Shouts", "Gospel Responses", "Dancehall Hype", "Producer-Tag Style", "Ambient Vocal Textures"],
        "Use {name} ad-libs selectively, keeping them concise, section-aware, and out of the lead lyric's way.",
    ),
    "19_song_length.csv": [
        ("About 30 Seconds", "Target about thirty seconds with one immediate idea and no wasted setup.", "30"),
        ("About 45 Seconds", "Target about forty-five seconds with a hook-first micro structure.", "45"),
        ("About 75 Seconds", "Target about seventy-five seconds with one developed verse and hook return.", "75"),
        ("About 2.5 Minutes", "Target about two and a half minutes with concise development and a complete ending.", "150"),
        ("About 3.5 Minutes", "Target about three and a half minutes with room for a bridge or instrumental turn.", "210"),
        ("About 4.5 Minutes", "Target about four and a half minutes with gradual development and a full final section.", "270"),
        ("About 5 Minutes", "Target about five minutes with a long-form arc and earned repetition.", "300"),
        ("Short Radio Edit", "Target a concise radio edit near two minutes and forty-five seconds.", "165"),
        ("Extended Club Mix", "Target a five-minute club arrangement with mixable intro and outro passages.", "300"),
    ],
}


PRESET_BASE = {
    "genre": "Hip-Hop / Rap",
    "subgenre_era": "Modern Trap / Drill",
    "mood": "Confident and Luxurious",
    "vocal_delivery": "Deep Aggressive Rap",
    "vocal_gender_type": "Deep Male Lead",
    "instruments": "808s, Dark Piano and Brass",
    "production_style": "Hard Modern Trap Master",
    "bpm_tempo": "142 BPM Half-Time",
    "song_structure": "Rap Anthem",
    "hook_style": "Chanted Crowd Hook",
    "themes": "Self-Belief",
    "explicitness": "Mostly Clean",
    "aggression": "Strong",
    "darkness": "Balanced",
    "rhyme_density": "Balanced",
    "wordplay": "Selective Metaphor",
    "storytelling": "Character Portrait",
    "adlibs": "Sparse Accent Ad-Libs",
    "song_length": "About 3 Minutes",
}


def preset(name, description, **changes):
    values = {**PRESET_BASE, **changes}
    return {"name": name, "description": description, **values}


PRESETS = [
    preset("UK Drill Pressure", "Cold sliding-bass UK drill.", subgenre_era="UK Drill", mood="Dark and Paranoid", instruments="Drill Bass and Icy Bells", production_style="Cold UK Drill Mix", bpm_tempo="138 BPM Drill", song_structure="Drill Direct", themes="Rivals and Street Life", darkness="Very Dark"),
    preset("Brooklyn Drill Anthem", "Big New York drill anthem.", subgenre_era="Brooklyn Drill", vocal_delivery="Raspy Drill Cadence", bpm_tempo="142 BPM Half-Time", song_structure="Drill Direct"),
    preset("Golden Era Boom Bap", "Dusty sample-led lyric showcase.", subgenre_era="90s Boom Bap", mood="Nostalgic", vocal_delivery="Boom Bap Pocket", instruments="Boom Bap Drums and Jazz Samples", production_style="Raw Underground Mixtape", bpm_tempo="96 BPM Boom Bap", song_structure="Boom Bap Three Verse", hook_style="Sample Chop Hook"),
    preset("Rage Pit", "Maximal distorted rage rap.", subgenre_era="Rage Rap", mood="Chaotic", vocal_delivery="Rage Shouts", instruments="Rage Synths and Distorted 808s", production_style="Maximal Hyperpop", bpm_tempo="145 BPM Rage", hook_style="One-Word Chant", aggression="Relentless", darkness="Dark"),
    preset("West Coast G-Funk Cruise", "Sunny lowrider G-funk.", subgenre_era="G-Funk", mood="Celebratory", vocal_delivery="Conversational Rap", instruments="G-Funk Leads and Live Bass", production_style="West Coast Sunset Polish", bpm_tempo="92 BPM Head-Nod", themes="Summer Freedom"),
    preset("Contemporary R&B Night", "Polished intimate late-night R&B.", genre="R&B / Soul", subgenre_era="Contemporary R&B", mood="Seductive", vocal_delivery="Smooth R&B Croon", vocal_gender_type="Mixed-Gender Duet", instruments="Rhodes, Bass and Neo-Soul Guitar", production_style="Neo-Soul Boutique Studio", bpm_tempo="78 BPM Laid-Back", song_structure="R&B Slow Jam", hook_style="Soft Intimate Refrain", themes="Late-Night Desire", aggression="Gentle"),
    preset("Neo-Soul Velvet", "Warm human neo-soul performance.", genre="R&B / Soul", subgenre_era="Neo-Soul", mood="Warm and Intimate", vocal_delivery="Neo-Soul Runs", instruments="Rhodes, Bass and Neo-Soul Guitar", production_style="Warm Analog Tape", bpm_tempo="84 BPM Soul Pocket", themes="First Love"),
    preset("Bright Radio Pop", "Immediate modern radio pop.", genre="Pop", subgenre_era="Synth Pop", mood="Euphoric", vocal_delivery="Power Pop Belt", vocal_gender_type="Powerful Female Lead", production_style="Polished Radio Pop", bpm_tempo="118 BPM Driving", song_structure="Pop Immediate Chorus", hook_style="Big Sung Chorus", themes="Self-Belief", explicitness="Clean"),
    preset("Alternative Rock Catharsis", "Quiet-loud emotional alt rock.", genre="Rock", subgenre_era="Alternative Rock", mood="Bittersweet", vocal_delivery="Raspy Rock Belt", instruments="Grand Piano and String Quartet", production_style="Arena Rock Wide", bpm_tempo="118 BPM Driving", song_structure="Rock Quiet Loud", hook_style="Big Sung Chorus", themes="Breakup and Recovery"),
    preset("Shoegaze Bloom", "Luminous wall-of-guitar shoegaze.", genre="Shoegaze", subgenre_era="Shoegaze", mood="Dreamlike", vocal_delivery="Breathy Indie Singing", instruments="Shoegaze Guitar Wall and Dreamy Bass", production_style="Shoegaze Haze", bpm_tempo="92 BPM Head-Nod", hook_style="Soft Intimate Refrain", themes="Dreams and Sleep", aggression="Low Simmer"),
    preset("Classic Heavy Metal", "Twin-guitar heroic heavy metal.", genre="Metal", subgenre_era="Heavy Metal", mood="Heroic", vocal_delivery="Raspy Rock Belt", instruments="Metalcore Guitars and Double Kick", production_style="Arena Rock Wide", bpm_tempo="150 BPM Punk", song_structure="Rock Quiet Loud", hook_style="Gang Vocal Shout", themes="Ancient Myth", aggression="Hard-Hitting", darkness="Dark"),
    preset("Metalcore Breakdown", "Precision metalcore with clean chorus.", genre="Metal", subgenre_era="Metalcore", mood="Angry", vocal_delivery="Metalcore Scream and Clean", instruments="Metalcore Guitars and Double Kick", production_style="Metalcore Precision", bpm_tempo="160 BPM Double-Time", song_structure="Metalcore Breakdown", hook_style="Metalcore Clean Chorus", aggression="Breakdown Peak", darkness="Bleak"),
    preset("Pop-Punk Summer", "Fast bright sing-along pop punk.", genre="Punk", subgenre_era="Pop Punk", mood="Rebellious", vocal_delivery="Pop-Punk Snarl", instruments="Pop-Punk Guitars and Live Drums", production_style="Punk Basement Live", bpm_tempo="150 BPM Punk", song_structure="Punk Two Minute", hook_style="Pop-Punk Crowd Hook", themes="Summer Freedom", explicitness="Clean"),
    preset("Berlin Warehouse Techno", "Dark relentless club techno.", genre="Techno", subgenre_era="Berlin Techno", mood="Cold and Mechanical", vocal_delivery="Instrumental - No Vocals", vocal_gender_type="Instrumental / No Lead Vocal", instruments="Techno Kick, Rumble and Sequencers", production_style="Dark Club Techno", bpm_tempo="130 BPM Techno", song_structure="Techno Progressive", hook_style="Synth Riff Hook", themes="Dancefloor Escape", rhyme_density="None / Free Verse", wordplay="Minimal Lyrics", storytelling="No Narrative", adlibs="Completely Dry"),
    preset("Melodic Techno Horizon", "Emotional cinematic melodic techno.", genre="Techno", subgenre_era="Melodic Techno", mood="Dark to Triumphant", vocal_delivery="Breathy Indie Singing", instruments="Modular Synths and Drum Machines", production_style="Melodic Techno Cinema", bpm_tempo="130 BPM Techno", song_structure="Techno Progressive", hook_style="Synth Riff Hook", themes="Cosmic Exploration"),
    preset("Deep House Sunset", "Warm elegant deep house.", genre="House", subgenre_era="Deep House", mood="Warm and Intimate", vocal_delivery="Smooth R&B Croon", instruments="House Piano, Disco Bass and Claps", production_style="Deep House Warmth", bpm_tempo="120 BPM Deep House", song_structure="EDM Build and Drop", hook_style="Soft Intimate Refrain", themes="Summer Freedom"),
    preset("Uplifting Trance Flight", "Huge euphoric trance journey.", genre="Trance", subgenre_era="Uplifting Trance", mood="Euphoric", vocal_delivery="Power Pop Belt", instruments="Trance Supersaws and Arpeggios", production_style="Trance Euphoric Wide", bpm_tempo="134 BPM Trance", song_structure="Trance Journey", hook_style="Big Sung Chorus", themes="Ocean and Nature"),
    preset("Liquid DnB Heartbreak", "Fast liquid DnB with soulful vocal.", genre="Drum and Bass / Jungle", subgenre_era="Liquid Drum and Bass", mood="Bittersweet", vocal_delivery="Breathy Indie Singing", instruments="DnB Breakbeats, Reese Bass and Pads", production_style="DnB Club Pressure", bpm_tempo="174 BPM Liquid DnB", song_structure="DnB Vocal Journey", hook_style="Melodic Earworm", themes="Breakup and Recovery"),
    preset("Jungle Soundsystem", "Raw breakbeat jungle pressure.", genre="Drum and Bass / Jungle", subgenre_era="Jungle", mood="Rebellious", vocal_delivery="Dancehall Toasting", instruments="Jungle Breaks and Dub Sub", production_style="Jungle Soundsystem", bpm_tempo="180 BPM Jungle", song_structure="DnB Vocal Journey", hook_style="Dancehall Callout", themes="Dancefloor Escape", aggression="Hard-Hitting"),
    preset("Cinematic Dubstep Drop", "Massive bass-music trailer hybrid.", genre="Dubstep / Bass Music", subgenre_era="Brostep Dubstep", mood="Apocalyptic", vocal_delivery="Choir-Only Performance", vocal_gender_type="Massive Mixed Choir", instruments="Dubstep Wobbles and Cinematic Impacts", production_style="Dubstep Sub-Heavy", bpm_tempo="145 BPM Rage", song_structure="EDM Build and Drop", hook_style="Drop-Centered Instrumental Hook", themes="Dystopian Resistance", aggression="Explosive", darkness="Horror"),
    preset("Midnight Drift Phonk", "Distorted night-drive phonk.", genre="Electronic", subgenre_era="Drift Phonk", mood="Dark and Paranoid", vocal_delivery="Whisper Rap", instruments="Phonk Cowbells, Distorted Bass and Memphis Chops", production_style="Phonk Saturated", bpm_tempo="130 BPM Techno", hook_style="Sample Chop Hook", themes="Luxury Cars", darkness="Very Dark"),
    preset("Dark Ambient Void", "Slow immersive dark ambient.", genre="Ambient", subgenre_era="Dark Ambient", mood="Eerie", vocal_delivery="Instrumental - No Vocals", vocal_gender_type="Instrumental / No Lead Vocal", instruments="Modular Synths and Drum Machines", production_style="Ultra-Wide Atmospheric", bpm_tempo="Variable Rubato", song_structure="Ambient Evolution", hook_style="No Repeated Hook", themes="Cosmic Exploration", aggression="None", darkness="Abyssal", rhyme_density="None / Free Verse", wordplay="Minimal Lyrics", storytelling="No Narrative", adlibs="Completely Dry", song_length="About 4.5 Minutes"),
    preset("Horror Score Pursuit", "Cinematic horror chase cue.", genre="Orchestral / Cinematic", subgenre_era="Horror Score", mood="Suspenseful", vocal_delivery="Choir-Only Performance", vocal_gender_type="Small Gospel Choir", instruments="Horror Strings, Drones and Prepared Piano", production_style="Horror Film Soundstage", bpm_tempo="Half-Time to Double-Time", song_structure="Cinematic Three Act", hook_style="Synth Riff Hook", themes="Horror Pursuit", aggression="Dynamic Swells", darkness="Horror", rhyme_density="None / Free Verse", wordplay="Minimal Lyrics"),
    preset("Late-Night Jazz Club", "Natural small-club jazz.", genre="Jazz", subgenre_era="Cool Jazz", mood="Warm and Intimate", vocal_delivery="Jazz Scat", instruments="Grand Piano and String Quartet", production_style="Jazz Club Natural", bpm_tempo="84 BPM Soul Pocket", song_structure="Jazz Head Solos Head", hook_style="Jazz Motif", themes="City Isolation", aggression="Gentle"),
    preset("P-Funk Mothership", "Rubbery psychedelic funk party.", genre="Funk", subgenre_era="P-Funk", mood="Playful", vocal_delivery="Gospel Call and Response", instruments="Horn Section, Clavinet and Slap Bass", production_style="Vintage Soul Vinyl", bpm_tempo="100 BPM Funk Groove", hook_style="Call and Response", themes="Comedy and Absurdity", aggression="Moderate"),
    preset("Chicago Blues Confession", "Electric blues club story.", genre="Blues", subgenre_era="Chicago Blues", mood="Heartbroken", vocal_delivery="Raspy Rock Belt", instruments="Blues Guitar, Hammond Organ and Shuffle Drums", production_style="Live Band Room", bpm_tempo="78 BPM Laid-Back", song_structure="Country Story Arc", hook_style="Guitar Riff Hook", themes="Grief and Memory", storytelling="Linear Story"),
    preset("Modern Country Road", "Polished country road story.", genre="Country", subgenre_era="Modern Country", mood="Hopeful", vocal_delivery="Country Storytelling Twang", instruments="Telecaster, Pedal Steel and Drums", production_style="Country Radio Polish", bpm_tempo="96 BPM Boom Bap", song_structure="Country Story Arc", hook_style="Big Sung Chorus", themes="Road Trip", explicitness="Clean"),
    preset("Appalachian Folk Tale", "Acoustic mountain narrative.", genre="Folk / Acoustic", subgenre_era="Appalachian Folk", mood="Nostalgic", vocal_delivery="Folk Harmony Lead", instruments="Acoustic Guitar, Mandolin and Fiddle", production_style="Live Band Room", bpm_tempo="84 BPM Soul Pocket", song_structure="Country Story Arc", hook_style="Soft Intimate Refrain", themes="Family Legacy", storytelling="Three-Act Story", explicitness="Clean"),
    preset("Roots Reggae Reflection", "Warm roots reggae meditation.", genre="Reggae / Dancehall", subgenre_era="Roots Reggae", mood="Spiritual", vocal_delivery="Dancehall Toasting", instruments="Reggae Skank Guitar and Dub Bass", production_style="Dub Reggae Space Echo", bpm_tempo="78 BPM Laid-Back", hook_style="Call and Response", themes="Faith and Redemption", aggression="Gentle"),
    preset("Dancehall Summer", "Bright modern dancehall party.", genre="Reggae / Dancehall", subgenre_era="Modern Dancehall", mood="Celebratory", vocal_delivery="Dancehall Toasting", instruments="Dancehall Drums and Digital Stabs", production_style="Festival EDM Master", bpm_tempo="105 BPM Reggaeton", hook_style="Dancehall Callout", themes="Summer Freedom"),
    preset("Reggaeton Neon", "Polished nocturnal reggaeton.", genre="Latin / Reggaeton", subgenre_era="Reggaeton", mood="Seductive", vocal_delivery="Reggaeton Sing-Rap", vocal_gender_type="Mixed-Gender Duet", instruments="Reggaeton Dembow and Nylon Guitar", production_style="Polished Radio Pop", bpm_tempo="105 BPM Reggaeton", hook_style="Reggaeton Sing-Along", themes="Late-Night Desire"),
    preset("Afrobeat Golden Hour", "Layered joyful Afrobeat groove.", genre="Afrobeat / Afropop", subgenre_era="Afrobeat", mood="Celebratory", vocal_delivery="Afrobeat Melodic Phrasing", instruments="Afrobeat Guitars, Horns and Percussion", production_style="Live Band Room", bpm_tempo="110 BPM Afrobeat", hook_style="Afrobeat Circular Melody", themes="Friendship", explicitness="Clean"),
    preset("Gospel Redemption", "Full testimony and choir lift.", genre="Gospel", subgenre_era="Gospel Choir", mood="Spiritual", vocal_delivery="Gospel Call and Response", vocal_gender_type="Massive Mixed Choir", instruments="Gospel Organ, Piano and Choir", production_style="Orchestral Concert Hall", bpm_tempo="84 BPM Soul Pocket", song_structure="Gospel Testimony", hook_style="Gospel Choir Response", themes="Faith and Redemption", explicitness="Family Friendly", aggression="Dynamic Swells", darkness="Dark with Hope"),
    preset("Lo-Fi Study Rain", "Dusty relaxed instrumental lo-fi.", genre="Lo-Fi", subgenre_era="Lo-Fi Hip-Hop", mood="Meditative", vocal_delivery="Instrumental - No Vocals", vocal_gender_type="Instrumental / No Lead Vocal", instruments="Lo-Fi Keys, Dusty Drums and Tape Noise", production_style="Lo-Fi Cassette", bpm_tempo="72 BPM Slow", song_structure="Ambient Evolution", hook_style="No Repeated Hook", themes="Dreams and Sleep", aggression="None", rhyme_density="None / Free Verse", wordplay="Minimal Lyrics", storytelling="No Narrative", adlibs="Completely Dry"),
    preset("Vaporwave Mall Memory", "Degraded nostalgic vaporwave.", genre="Vaporwave", subgenre_era="Vaporwave", mood="Nostalgic", vocal_delivery="Robotic Vocoder", vocal_gender_type="Vocoder Ensemble", instruments="Analog Synthwave Rig", production_style="Vaporwave Degraded Digital", bpm_tempo="84 BPM Soul Pocket", song_structure="Ambient Evolution", hook_style="Sample Chop Hook", themes="Digital Identity"),
    preset("Epic Trailer Last Stand", "Orchestra, choir and modern impacts.", genre="Orchestral / Cinematic", subgenre_era="Epic Trailer Hybrid", mood="Heroic", vocal_delivery="Choir-Only Performance", vocal_gender_type="Massive Mixed Choir", instruments="Orchestral Strings, Brass and Timpani", production_style="Cinematic Trailer Hybrid", bpm_tempo="Half-Time to Double-Time", song_structure="Cinematic Three Act", hook_style="Gang Vocal Shout", themes="Underdog Victory", aggression="Explosive", darkness="Dark with Hope", song_length="About 4 Minutes"),
]


def append_rows(path, rows):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        existing = list(csv.DictReader(handle))
        fieldnames = list(existing[0]) if existing else ["index", "name", "prompt"]
    names = {row["name"] for row in existing}
    for row in rows:
        name, prompt, *extra = row
        if name in names:
            continue
        item = {"index": str(len(existing) + 1), "name": name, "prompt": prompt}
        if "seconds" in fieldnames:
            item["seconds"] = extra[0] if extra else "180"
        existing.append(item)
        names.add(name)
    for index, row in enumerate(existing, 1):
        row["index"] = str(index)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(existing)


def append_presets(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        existing = list(csv.DictReader(handle))
        fieldnames = list(existing[0])
    names = {row["name"] for row in existing}
    existing.extend(row for row in PRESETS if row["name"] not in names)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(existing)


def main():
    for filename, rows in ADDITIONS.items():
        append_rows(CATALOG / filename, rows)
    append_presets(CATALOG / "20_presets.csv")


if __name__ == "__main__":
    main()

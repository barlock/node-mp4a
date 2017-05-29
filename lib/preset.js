"use strict";

const lang = "eng",
    imageBasedSubs = [
        "pgssub",
        "dvdsub",
        "s_hdmv/pgs",
        "hdmv_pgs_subtitle",
        "dvd_subtitle",
        "pgssub"
    ];

function streamType (meta, type) {
    return meta.streams.filter(stream => stream.codec_type === type);
}

function filterLang(streams) {
    return streams.filter(stream => {
        return stream.tags && stream.tags.language === lang
    })
}

function chooseStreamSet (original, lang) {
    return lang && lang.length > 0 ? lang : original;
}

function streamMap (streams) {
    return streams.map(stream => `-map 0:${stream.index}`)
}

module.exports = (meta, console) => command => {
    let video = streamType(meta, "video"),
        videoLang = filterLang(video),
        audio = streamType(meta, "audio"),
        audioLang = filterLang(audio),
        subtitle = streamType(meta, "subtitle")
            .filter(subtitle => !imageBasedSubs.includes(subtitle.codec_name)),
        subtitleLang = filterLang(subtitle);

    video = chooseStreamSet(video, videoLang);
    audio = chooseStreamSet(audio, audioLang);
    subtitle = chooseStreamSet(subtitle, subtitleLang);

    const audioHas2chAac = audio
        .some(stream => stream.codec_name === "aac" && stream.channels === 2);

    let mappings = streamMap(video);

    mappings = mappings.concat(streamMap(audio));

    if (audio.length > 0 && !audioHas2chAac) {
        const bestAudio = audio.reduce((best, stream) =>
                best.channels > stream.channels ? best : stream),
            downMixedIndex = mappings.length;

        console.log("  ├ Adding 2ch AAC track");

        mappings = mappings.concat([
            `-map 0:${bestAudio.index}`,
            `-c:${downMixedIndex} aac`,
            `-ac:${downMixedIndex} 2`
        ])
    }

    mappings = mappings.concat(streamMap(subtitle));

    command.
        outputOptions([
            "-c:v copy",
            "-c:a copy",
            "-c:s mov_text",
            "-movflags +faststart"
        ].concat(mappings))
};

import { countryOptions } from "./countries.js";

// Una selección amplia de Emoji Unicode agrupada para que el selector siga siendo
// rápido y útil sin depender de servicios o librerías externas.
export const EMOJI_GROUPS = [
  {
    id: "faces",
    label: "Caras y personas",
    icon: "😀",
    groups: [
      [
        "cara sonrisa feliz alegría risa",
        "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳",
      ],
      [
        "cara emoción duda tristeza llanto enfado miedo",
        "😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠",
      ],
      [
        "cara enfermo sueño demonio fantasma",
        "🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃",
      ],
      [
        "gesto mano dedos saludo aplauso corazón",
        "👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾",
      ],
      [
        "persona bebé niño mujer hombre adulto mayor familia",
        "👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 👲 👳 🧕 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍🎓 👩‍🏫 👨‍⚖️ 👩‍🌾 👨‍🍳 👩‍🔧 👨‍🏭 👩‍💼 👨‍🔬 👩‍💻 👨‍🎤 👩‍🎨 👨‍✈️ 👩‍🚀 👨‍🚒 🥷 👸 🤴 🧙 🧚 🧛 🧜 🧝 🧞 🧟",
      ],
      [
        "persona actividad deporte baile caminar correr",
        "🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 💆 💇 🚶 🧍 🧎 🏃 💃 🕺 👯 🧖 🧗 🤺 🏇 ⛷️ 🏂 🏌️ 🏄 🚣 🏊 ⛹️ 🏋️ 🚴 🚵 🤸 🤼 🤽 🤾 🤹 🧘",
      ],
      ["amor pareja familia corazón beso", "🧑‍🤝‍🧑 👭 👫 👬 💏 💑 👪 🫂 🗣️ 👤 👥 🫀 🫁 🧠 🦷 🦴 👀 👁️ 👅 👄 💋"],
    ],
  },
  {
    id: "nature",
    label: "Animales y naturaleza",
    icon: "🐼",
    groups: [
      ["animal cara mascota gato perro oso", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐻‍❄️ 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒"],
      [
        "animal mamífero bosque campo",
        "🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🫎 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🦂",
      ],
      ["animal mar pez océano", "🐢 🐍 🦎 🦖 🦕 🐙 🦑 🪼 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🦭 🐊"],
      [
        "animal granja safari",
        "🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🫏 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐕‍🦺 🐈 🐈‍⬛ 🪽 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🪿 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔",
      ],
      [
        "planta flor jardín árbol naturaleza",
        "💐 🌸 💮 🪷 🏵️ 🌹 🥀 🌺 🌻 🌼 🌷 🪻 🌱 🪴 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍀 🍁 🍂 🍃 🪹 🪺 🍄 🪨 🪵",
      ],
      [
        "tiempo cielo sol luna estrella lluvia nieve fuego",
        "🌍 🌎 🌏 🌐 🗺️ 🧭 🌋 🏔️ ⛰️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌌 🌁 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌈 ☔ ⚡ ☄️ 🔥 💧 🌊 🌙 🌛 🌜 🌚 🌝 🌞 ⭐ 🌟 ✨",
      ],
    ],
  },
  {
    id: "food",
    label: "Comida y bebida",
    icon: "🍜",
    groups: [
      [
        "fruta vegetal comida saludable",
        "🍏 🍎 🍐 🍊 🍋 🍋‍🟩 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🫛 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🫘 🌰 🥜",
      ],
      [
        "pan desayuno queso huevo carne",
        "🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🫕 🥣 🥗 🍿 🧈 🧂",
      ],
      ["japón japonés sushi ramen arroz comida", "🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡"],
      ["dulce postre tarta helado", "🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯"],
      ["bebida café té alcohol bar", "🍼 🥛 ☕ 🫖 🍵 🍶 🍾 🍷 🍸 🍹 🍺 🍻 🥂 🥃 🫗 🥤 🧋 🧃 🧉 🧊"],
      ["mesa cubiertos restaurante cocina", "🥢 🍽️ 🍴 🥄 🔪 🫙 🏺"],
    ],
  },
  {
    id: "travel",
    label: "Viajes y lugares",
    icon: "🗼",
    groups: [
      [
        "lugar edificio casa hotel templo iglesia castillo",
        "🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🛤️ 🏞️ 🏟️ 🎡 🎢 🎠 ⛲ ⛺ 🏕️ 🏖️ 🏜️ 🏝️ 🏰 🏯 🗼 🗽",
      ],
      [
        "transporte coche taxi autobús carretera",
        "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🛞 ⛽ 🛣️ 🚧 🚦 🚥 🛑",
      ],
      ["tren metro estación transporte", "🚂 🚃 🚄 🚅 🚆 🚇 🚈 🚉 🚊 🚝 🚞 🚋"],
      ["avión aeropuerto vuelo viaje", "✈️ 🛫 🛬 🛩️ 💺 🚁 🚟 🚠 🚡 🛰️ 🚀 🛸"],
      ["barco puerto mar viaje", "⛵ 🛶 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🛟"],
      ["maleta mapa viaje vacaciones", "🧳 🎒 🗺️ 🧭 📍 🚩 🎌 🏁"],
    ],
  },
  {
    id: "activities",
    label: "Actividades",
    icon: "🎨",
    groups: [
      ["evento fiesta celebración premio", "🎉 🎊 🎈 🎂 🎁 🎀 🎗️ 🎟️ 🎫 🏆 🏅 🥇 🥈 🥉"],
      [
        "deporte pelota juego",
        "⚽ ⚾ 🥎 🏀 🏐 🏈 🏉 🎾 🥏 🎳 🏏 🏑 🏒 🥍 🏓 🏸 🥊 🥋 🥅 ⛳ ⛸️ 🎣 🤿 🎽 🎿 🛷 🥌 🎯 🪀 🪁 🔫 🎱 🔮 🪄 🎮 🕹️ 🎰 🎲 🧩 ♟️ 🃏 🀄 🎴",
      ],
      [
        "arte música cine teatro cámara",
        "🎭 🖼️ 🎨 🧵 🪡 🧶 🎼 🎵 🎶 🎤 🎧 📻 🎷 🪗 🎸 🎹 🎺 🎻 🪕 🥁 🪘 🪇 🪈 🎬 🎞️ 📽️ 🎥 📸 📷 📹",
      ],
      ["libro leer escribir estudiar", "📚 📖 🔖 📰 🗞️ 📓 📔 📒 📕 📗 📘 📙 📄 📜 📝 ✏️ 🖊️ 🖋️ 🖌️ 🖍️"],
    ],
  },
  {
    id: "objects",
    label: "Objetos",
    icon: "💡",
    groups: [
      [
        "ropa moda compras",
        "👓 🕶️ 🥽 🥼 🦺 👔 👕 👖 🧣 🧤 🧥 🧦 👗 👘 🥻 🩱 🩲 🩳 👙 👚 🪭 👛 👜 👝 🛍️ 👞 👟 🥾 🥿 👠 👡 🩰 👢 🪮 👑 👒 🎩 🎓 🧢 🪖 ⛑️ 📿 💄 💍 💎",
      ],
      [
        "teléfono ordenador tecnología",
        "⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 🕹️ 🗜️ 💽 💾 💿 📀 🧮 🎥 📺 📷 📸 📹 📼 🔍 🔎 💡 🔦 🏮 🪔",
      ],
      ["dinero compras pago", "💰 🪙 💴 💵 💶 💷 💸 💳 🧾 💹"],
      ["herramienta trabajo reparación", "🔧 🪛 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧱 ⛓️ 🧲 🪜 🧰 🪣 🧹 🧺 🧻 🪠 🧽 🧯"],
      ["salud medicina hospital", "💊 💉 🩸 🩹 🩼 🩺 🩻 🌡️"],
      ["casa hogar llave puerta cama", "🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🛌 🧸 🪆 🖼️ 🪞 🪟 🛒 🎁 🎈"],
      [
        "oficina correo calendario",
        "💌 ✉️ 📨 📩 📤 📥 📦 📫 📪 📬 📭 📮 🗳️ 📅 📆 🗓️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓",
      ],
    ],
  },
  {
    id: "symbols",
    label: "Símbolos",
    icon: "❤️",
    groups: [
      ["corazón amor color", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟"],
      ["signo bien mal aviso", "✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ⚠️ 🚸 ⛔ 🚫 🚳 🚭 🚯 🚱 🚷 📵 🔞 ‼️ ⁉️ ❓ ❔ ❕ ❗"],
      ["flecha dirección", "⬆️ ↗️ ➡️ ↘️ ⬇️ ↙️ ⬅️ ↖️ ↕️ ↔️ ↩️ ↪️ ⤴️ ⤵️ 🔃 🔄 🔙 🔚 🔛 🔜 🔝"],
      ["religión zodiaco signo", "☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓"],
      [
        "formas color círculo cuadrado",
        "🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🔳 🔲",
      ],
      [
        "música reciclaje accesibilidad información",
        "♻️ ⚜️ 🔱 📛 🔰 ⭕ ♨️ 💢 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤 🎵 🎶 ℹ️ 🅿️ 🆘 🆕 🆓 🆒 🆗 🆙 🆚 ♿",
      ],
    ],
  },
  {
    id: "flags",
    label: "Banderas",
    icon: "🇯🇵",
    groups: [
      ["bandera señal", "🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🎌"],
      ...countryOptions().map(({ value, label }) => [`bandera ${value}`, label.split(" ")[0]]),
    ],
  },
];

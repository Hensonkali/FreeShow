// Offline-only verse of the day. No network access is required or permitted here:
// the verses below are taken verbatim from the bundled public-domain King James Version
// and the pick is deterministic from the day of the year.
import { get } from "svelte/store"
import { language } from "../../stores"

const VERSES: Array<[string, string]> = [
    ["John 3:16", "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."],
    ["Psalm 23:1", "The Lord is my shepherd; I shall not want."],
    ["Psalm 46:1", "God is our refuge and strength, a very present help in trouble."],
    ["Psalm 119:105", "Thy word is a lamp unto my feet, and a light unto my path."],
    ["Philippians 4:13", "I can do all things through Christ which strengtheneth me."],
    ["Romans 8:28", "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."],
    ["Romans 12:2", "And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God."],
    ["Jeremiah 29:11", "For I know the thoughts that I think toward you, saith the Lord, thoughts of peace, and not of evil, to give you an expected end."],
    ["Isaiah 40:31", "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint."],
    ["Isaiah 41:10", "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness."],
    ["Isaiah 55:11", "So shall my word be that goeth forth out of my mouth: it shall not return unto me void, but it shall accomplish that which I please, and it shall prosper in the thing whereto I sent it."],
    ["Matthew 6:33", "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you."],
    ["Matthew 11:28", "Come unto me, all ye that labour and are heavy laden, and I will give you rest."],
    ["John 14:1", "Let not your heart be troubled: ye believe in God, believe also in me."],
    ["John 14:6", "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me."],
    ["1 John 4:8", "He that loveth not knoweth not God; for God is love."],
    ["Micah 6:8", "He hath shewed thee, O man, what is good; and what doth the Lord require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?"],
    ["Joshua 1:9", "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the Lord thy God is with thee whithersoever thou goest."],
    ["Hebrews 11:1", "Now faith is the substance of things hoped for, the evidence of things not seen."],
    ["1 Corinthians 13:13", "And now abideth faith, hope, charity, these three; but the greatest of these is charity."],
    ["Proverbs 3:5", "Trust in the Lord with all thine heart; and lean not unto thine own understanding."],
    ["Proverbs 3:6", "In all thy ways acknowledge him, and he shall direct thy paths."],
    ["2 Corinthians 5:17", "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new."],
    ["Ephesians 6:10", "Finally, my brethren, be strong in the Lord, and in the power of his might."],
    ["Romans 5:8", "But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us."],
    ["John 1:1", "In the beginning was the Word, and the Word was with God, and the Word was God."],
    ["Acts 1:8", "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judea, and in Samaria, and unto the uttermost part of the earth."],
    ["Psalm 139:14", "I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well."],
    ["Matthew 5:9", "Blessed are the peacemakers: for they shall be called the children of God."],
    ["1 Timothy 1:15", "This is a faithful saying, and worthy of all acceptation, that Christ Jesus came into the world to save sinners; of whom I am chief."]
]

const ONE_DAY = 1000 * 60 * 60 * 24
const getDayOfYear = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 0)
    const diff = now.getTime() - start.getTime()
    return Math.floor(diff / ONE_DAY)
}

export async function getVOTD(): Promise<string> {
    // verses are only in English
    if (!get(language).startsWith("en")) return ""

    const [reference, text] = VERSES[(getDayOfYear() - 1 + VERSES.length) % VERSES.length]!

    return `${text} — ${reference} (KJV)`
}

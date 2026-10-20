"""Original Duet Hand lettering. Build only: pip install fonttools."""
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from pathlib import Path
import math, random
# Deliberately uneven, drawn centerlines. 0–100 coordinates, y points upward.
letters={
'A':[[(7,0),(34,97),(43,100),(76,1)],[(19,35),(61,37)]],
'B':[[(10,1),(9,96),(39,98),(62,87),(61,70),(44,54),(11,53)],[(34,54),(66,44),(68,20),(51,3),(10,2)]],
'C':[[(73,85),(54,99),(29,95),(12,75),(8,42),(15,14),(36,1),(60,5),(74,18)]],
'D':[[(11,0),(9,98),(37,98),(60,85),(73,60),(70,31),(51,7),(11,0)]],
'E':[[(68,98),(11,97),(9,2),(70,4)],[(11,53),(57,55)]],
'F':[[(13,1),(11,97),(70,99)],[(12,53),(56,55)]],
'G':[[(73,84),(52,98),(27,92),(11,71),(9,36),(21,10),(45,2),(70,14),(72,48),(47,47)]],
'H':[[(11,0),(9,98)],[(69,99),(72,1)],[(11,51),(70,54)]],
'I':[[(17,98),(62,99)],[(39,97),(41,2)],[(17,1),(65,3)]],
'J':[[(21,98),(71,99),(70,28),(60,7),(36,1),(16,11),(10,29)]],
'K':[[(12,0),(10,98)],[(70,98),(12,43),(74,1)]],
'L':[[(13,98),(10,2),(70,4)]],
'M':[[(8,1),(10,98),(39,46),(69,98),(74,0)]],
'N':[[(10,0),(9,98),(72,2),(69,99)]],
'O':[[(39,99),(18,87),(8,58),(11,25),(28,3),(51,1),(69,20),(75,53),(66,83),(45,98),(39,99)]],
'P':[[(11,0),(9,97),(41,99),(64,85),(68,66),(54,50),(12,47)]],
'Q':[[(39,99),(18,87),(8,58),(11,25),(28,3),(51,1),(69,20),(75,53),(66,83),(39,99)],[(48,25),(80,-7)]],
'R':[[(11,0),(9,97),(41,99),(64,85),(68,66),(54,50),(12,47)],[(40,48),(74,0)]],
'S':[[(72,85),(53,98),(29,94),(13,79),(16,59),(39,47),(63,35),(69,16),(52,2),(28,3),(10,16)]],
'T':[[(5,97),(77,99)],[(40,96),(42,0)]],
'U':[[(10,98),(10,28),(20,7),(39,1),(59,7),(70,28),(69,99)]],
'V':[[(6,98),(35,0),(43,2),(75,99)]],
'W':[[(3,98),(19,0),(40,59),(60,0),(80,99)]],
'X':[[(8,98),(73,0)],[(71,99),(10,1)]],
'Y':[[(6,98),(40,49),(74,99)],[(40,49),(41,1)]],
'Z':[[(9,97),(73,99),(9,1),(74,3)]],
'0':[[(39,99),(18,87),(8,58),(11,25),(28,3),(51,1),(69,20),(75,53),(66,83),(39,99)]],
'1':[[(20,76),(43,99),(42,2)],[(20,1),(65,2)]],
'2':[[(11,79),(21,95),(43,99),(65,88),(68,68),(50,48),(12,3),(72,4)]],
'3':[[(11,87),(34,99),(58,92),(68,72),(53,53),(34,50)],[(37,51),(62,43),(69,25),(57,6),(32,1),(12,14)]],
'4':[[(57,1),(57,98),(8,34),(76,35)]],
'5':[[(71,98),(15,97),(12,54),(41,58),(62,46),(69,26),(57,6),(31,1),(11,12)]],
'6':[[(65,94),(45,98),(22,81),(10,48),(12,19),(29,2),(53,5),(69,23),(64,44),(47,56),(12,45)]],
'7':[[(9,98),(74,99),(33,1)]],
'8':[[(38,99),(16,89),(15,68),(38,51),(64,35),(69,18),(52,2),(28,2),(10,20),(18,41),(56,63),(67,82),(53,98),(38,99)]],
'9':[[(69,57),(39,47),(17,58),(10,78),(24,96),(48,98),(67,80),(70,48),(58,16),(37,2),(15,7)]],
'.':[[(38,1),(39,4)]],'-':[[(17,46),(62,48)]],"'": [[(40,97),(36,80)]],
'?':[[(12,80),(23,96),(46,99),(66,84),(63,66),(42,48),(39,28)],[(38,2),(39,5)]],
':':[[(38,68),(39,71)],[(38,19),(39,22)]]}
fb=FontBuilder(1000,isTTF=True); order=['.notdef','space']+['uni%04X'%ord(c) for c in letters];fb.setupGlyphOrder(order)
glyphs={};metrics={};cmap={32:'space'}
for index,name in enumerate(order):
    pen=TTGlyphPen(None)
    if name not in ('.notdef','space'):
        ch=chr(int(name[3:],16)); rng=random.Random(ord(ch)); paths=letters[ch]
        for path in paths:
            points=[(x*7+55+rng.uniform(-2,2),y*7+100+rng.uniform(-2,2)) for x,y in path]
            radius=43
            # Round-ended ink strokes, with tiny variations in each glyph.
            for x,y in points:
                ring=[(round(x+radius*math.cos(i*math.tau/12)),round(y+radius*math.sin(i*math.tau/12))) for i in range(12)]
                pen.moveTo(ring[0]);[pen.lineTo(p) for p in ring[1:]];pen.closePath()
            for (x,y),(u,v) in zip(points,points[1:]):
                length=math.hypot(u-x,v-y)
                if not length:continue
                dx=-(v-y)/length*radius;dy=(u-x)/length*radius
                pen.moveTo((round(x-dx),round(y-dy)));pen.lineTo((round(u-dx),round(v-dy)));pen.lineTo((round(u+dx),round(v+dy)));pen.lineTo((round(x+dx),round(y+dy)));pen.closePath()
        cmap[ord(ch)]=name
        if ch.isalpha():cmap[ord(ch.lower())]=name
    glyphs[name]=pen.glyph();metrics[name]=(710 if name!='space' else 320,25)
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics(metrics);fb.setupHorizontalHeader(ascent=900,descent=-100);fb.setupCharacterMap(cmap)
fb.setupNameTable({'familyName':'Duet Hand','styleName':'Regular','uniqueFontIdentifier':'ProjectDuetHand-1','fullName':'Duet Hand Regular','psName':'DuetHand-Regular','version':'Version 1.0'})
fb.setupOS2(sTypoAscender=900,sTypoDescender=-100,usWinAscent=900,usWinDescent=100);fb.setupPost();fb.setupMaxp()
fb.save(Path(__file__).resolve().parents[1]/'public/assets/duet-hand.ttf')

from PIL import Image, ImageDraw

# ---------- helpers ----------
def H(c):
    c=c.lstrip('#'); return (int(c[0:2],16),int(c[2:4],16),int(c[4:6],16),255)
OUT=H('#10141a')
def newc(w=24,h=26): 
    im=Image.new('RGBA',(w,h),(0,0,0,0)); return im, ImageDraw.Draw(im)
def rect(d,x0,y0,x1,y1,c): d.rectangle([x0,y0,x1,y1],fill=c)
def add_outline(im, col=OUT):
    # add 1px dark outline around all opaque pixels (clean chibi look)
    px=im.load(); w,hh=im.size; out=im.copy(); o=out.load()
    for y in range(hh):
        for x in range(w):
            if px[x,y][3]==0:
                # neighbor opaque?
                nb=False
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                    nx,ny=x+dx,y+dy
                    if 0<=nx<w and 0<=ny<hh and px[nx,ny][3]>0: nb=True;break
                if nb: o[x,y]=col
    return out

# warrior palette
P=dict(steel=H('#74808f'), steeld=H('#525c6b'), steell=H('#9bb0c2'),
       skin=H('#caa06e'), skind=H('#a87f50'),
       gold=H('#d6a23c'), blade=H('#cfd9e4'), bladed=H('#9aa6b4'),
       wood=H('#6e4f33'), woodd=H('#4f3924'), red=H('#9a3b3b'),
       leg=H('#3f4654'), boot=H('#2c313b'))

def warrior(direction='down', frame=0, state='idle'):
    im,d=newc()
    P_=P
    bob = -1 if (state=='walk' and frame==1) else 0
    # legs
    if direction in ('down','up'):
        lx0,lx1=9,11; rx0,rx1=13,15
        if state=='walk' and frame==1: ly=22+0; ry=21
        elif state=='walk' and frame==0: ly=21; ry=22
        else: ly=ry=22
        rect(d,lx0,18,lx1,ly+2,P_['leg']); rect(d,lx0,ly+1,lx1,ly+2,P_['boot'])
        rect(d,rx0,18,rx1,ry+2,P_['leg']); rect(d,rx0,ry+1,rx1,ry+2,P_['boot'])
    else: # side
        if state=='walk' and frame==1: rect(d,10,18,12,24,P_['leg']); rect(d,13,18,15,23,P_['leg'])
        else: rect(d,11,18,13,24,P_['leg']); rect(d,12,18,14,23,P_['leg'])
        rect(d,10,23,15,24,P_['boot'])
    # torso (armor)
    ty=13+bob
    rect(d,8,ty,16,ty+7,P_['steel']); rect(d,8,ty+5,16,ty+7,P_['steeld'])
    rect(d,8,ty+3,16,ty+4,P_['gold'])  # belt
    # head (big, chibi)
    hy=2+bob
    rect(d,6,hy,17,hy+11,P_['steel'])      # helmet
    rect(d,6,hy,17,hy+2,P_['steell'])      # helmet top light
    rect(d,11,hy-2,12,hy+1,P_['red'])      # plume
    if direction=='down':
        rect(d,8,hy+4,15,hy+9,P_['skin'])  # face
        rect(d,8,hy+8,15,hy+9,P_['skind'])
        rect(d,10,hy+6,11,hy+7,OUT); rect(d,12,hy+6,13,hy+7,OUT) # eyes
    elif direction=='up':
        rect(d,7,hy+4,16,hy+10,P_['steeld']) # back of helmet
        rect(d,7,hy+4,16,hy+5,P_['steel'])
    else: # side (faces right)
        rect(d,11,hy+4,16,hy+9,P_['skin']); rect(d,11,hy+8,16,hy+9,P_['skind'])
        rect(d,14,hy+6,15,hy+7,OUT) # eye
        rect(d,6,hy+3,9,hy+10,P_['steeld']) # back helmet
    # shield + sword by direction
    atk = (state=='attack')
    if direction=='down':
        # shield left, sword right
        rect(d,3,ty,7,ty+6,P_['wood']); rect(d,3,ty,7,ty+1,P_['steell']); rect(d,4,ty+2,6,ty+4,P_['gold'])
        sx=16
        if atk and frame==1: rect(d,15,ty+5,20,ty+7,P_['blade']); rect(d,15,ty+6,20,ty+7,P_['bladed']) # swing across low
        elif atk: rect(d,17,hy,19,ty+4,P_['blade'])  # raised
        else: rect(d,17,ty-1,19,ty+6,P_['blade']); rect(d,17,ty+6,19,ty+7,P_['gold'])
    elif direction=='up':
        rect(d,17,ty,21,ty+6,P_['wood']); rect(d,17,ty,21,ty+1,P_['steell'])
        if atk and frame==1: rect(d,4,ty+3,9,ty+5,P_['blade'])
        else: rect(d,5,hy,7,ty+5,P_['blade']); rect(d,5,ty+5,7,ty+6,P_['gold'])
    else: # side faces right: sword forward(right), shield back(left)
        rect(d,5,ty+1,8,ty+6,P_['wood']); rect(d,5,ty+1,8,ty+2,P_['steell'])
        if atk and frame==1: rect(d,16,ty+2,23,ty+4,P_['blade']); rect(d,22,ty+2,23,ty+4,P_['bladed'])
        elif atk: rect(d,15,hy+2,17,ty+3,P_['blade'])
        else: rect(d,16,ty-1,18,ty+6,P_['blade']); rect(d,16,ty+6,18,ty+7,P_['gold'])
    return add_outline(im)

# contact sheet of idle in 3 dirs + a walk + attack (down)
tests=[('down','idle',0),('up','idle',0),('side','idle',0),('side','walk',1),('down','attack',1),('side','attack',1)]
scale=6
sheet=Image.new('RGBA',(len(tests)*(24*scale+8), 26*scale+24),(38,42,50,255))
dr=ImageDraw.Draw(sheet); x=4
for dirn,st,fr in tests:
    sp=warrior(dirn,fr,st).resize((24*scale,26*scale),Image.NEAREST)
    sheet.alpha_composite(sp,(x,20)); dr.text((x,4),f"{dirn}/{st}",fill=(232,224,208,255)); x+=24*scale+8
sheet.save('/home/claude/chibi/_warrior_test.png')
print("saved", sheet.size)

import jwt from 'jsonwebtoken';
import {
    getStorage,
    ref,
    getDownloadURL,
    uploadBytesResumable,
    deleteObject
} from 'firebase/storage'
import db from '../config/db.config';
import JWTUntils from '../utils/jwt';
import md5 from 'md5';
import path from 'path'
import sendMail from '../utils/mailer';
import 'dotenv/config';

class AuthControlller {
    //[POST] baseUrl/auth
    verifyToken(req: any, res: any) {
        res.status(200).json({
            data: {
                code: 'auth/verifyToken.success',
                message: 'token verification successful'
            }
        })
    }

    //[POST] BaseURL/auth/register
    register(req: any, res: any) {
        try {
            const fullName: string = (req.body.fullName).toLowerCase().trim();
            const email: string = req.body.email.toLowerCase().trim();
            const password: string = req.body.password.trim();
            const passwordHash: string = md5(password);
            db.query(
                'INSERT INTO user (fullName, email, password) VALUES (?, ?, ?)',
                [fullName, email, passwordHash],
                (error, results) => {
                    if (error) {
                        throw error;
                    }
                    res.status(200).json({
                        code: 'auth/register.success',
                        message: 'Your account has been registered'
                    })
                }
            );
        } catch (error: any) {
            res.status(500).json({
                code: 'auth/register.error',
                error: error.message
            })
        }
    }

    //[POST] BaseURL/auth/login
    login(req: any, res: any) {
        try {
            const email: string = req.body.email.toLowerCase().trim();
            const password: string = req.body.password.trim();
            const passwordHash: string = md5(password);
            const query = `SELECT id, avatar, fullName, email, phone, address FROM user WHERE email = "${email}" AND password = "${passwordHash}" AND type = 0`;
            let accessToken: string;
            let refreshToken: string;

            db.query(query, (error, results: any) => {
                if (error) throw error;

                if (results.length) {
                    accessToken = JWTUntils.generateAccessToken(results[0])
                    refreshToken = JWTUntils.generateRefreshToken(results[0])
                    res.status(200).json({
                        code: 'auth/login.success',
                        message: 'login successful',
                        data: {
                            currentUser: results[0],
                            accessToken,
                            refreshToken
                        }
                    });
                } else {
                    res.status(401).json({
                        code: 'auth/login.unauthorized',
                        message: 'Email or password is incorrect'
                    })
                }
            })
        } catch (error: any) {
            res.status(500).json({
                code: 'auth/login.error',
                error: error.message
            })
        }
    }

    //[POST] BaseURL/auth/token
    refreshToken(req: any, res: any) {
        const refreshToken: string = req.body.refreshToken;
        if (!refreshToken) res.status(401).json('you are not authenticated');
        jwt.verify(refreshToken, process.env.JWT_REFRESHTOKEN_SECRET!, (err: any, user: any) => {
            if (err) res.status(403).json('token is invalid');

            const newAccessToken = JWTUntils.generateAccessToken(user);
            const newRefreshToken = JWTUntils.generateRefreshToken(user);
            res.status(200).json({
                data: {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken
                }
            })
        })
    }

    //[PATCH] baseUrl/auth/profile/:userId
    async changeAvatar(req: any, res: any) {
        try {
            const storage = getStorage();
            const userId: number = req.user.id;

            const user: any = await db.promise().query('SELECT avatar FROM user WHERE id = ?', [userId]);
            const oldAvatarUrl: string = user[0].avatar;
            const hasOldAvatar: boolean = !!oldAvatarUrl;

            if (hasOldAvatar) {
                // Delete old image with same name
                const oldStorageRef = ref(storage, `user_avatar/${userId + path.extname(req.file.originalname)}`);
                await deleteObject(oldStorageRef);
            }

            //upload new image
            const storageReft = ref(storage, `user_avatar/${userId + path.extname(req.file.originalname)}`);
            const snapshot = await uploadBytesResumable(storageReft, req.file.buffer);
            const url: string = await getDownloadURL(snapshot.ref);

            db.query('UPDATE user SET avatar = ? WHERE id = ?', ([url, userId]), (err, result) => {
                if (err) throw err;
                if (result) {
                    res.status(200).json({
                        code: 'auth/changeAvatar.success',
                        message: 'Successfully changed',
                    })
                } else {
                    res.status(404).json({
                        code: 'auth/changeAvatar.notFound',
                        message: 'not found user'
                    })
                }
            })
        } catch (error: any) {
            res.status(500).json({
                code: 'auth/changeAvatar.error',

                error: error.message
            })
        }
    }

    //[PUT] baseUrl/auth/profile/:userId
    changeProfile(req: any, res: any) {
        try {
            const userId: number = req.user.id;
            const fullName: string = req.body.fullName.toLowerCase().trim();
            const phone: string = req.body.phone.trim();
            const address: string = req.body.address.toLowerCase().trim();

            db.query('UPDATE user SET fullName = ?, phone = ?, address = ? WHERE id = ?', ([fullName, phone, address, userId]), (err, result) => {
                if (err) throw err;
                if (result) {
                    res.status(200).json({
                        code: 'auth/changeProfile.success',
                        message: 'Successfully changed',
                    })
                } else {
                    res.status(404).json({
                        code: 'auth/changeProfile.notFound',
                        message: 'not found user'
                    })
                }
            });
        } catch (error: any) {
            res.status(500).json({
                code: 'auth/changeProfile.error',

                error: error.message
            })
        }
    }

    //[POST] baseURL/auth/password
    sendMail(req: any, res: any) {
        try {
            const email: string = req.body.email.toLowerCase().trim();
            const emailToken: string = JWTUntils.generateEmailToken(email);
            sendMail(email, "Reset password", `
        <div style="width: 100%; background-color: #fff;">
    <header style="background-color: #333; padding: 12px; color: #fff; display: flex; justify-content: end;">
        <span style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">VIEW IN BROWSER</span>
    </header>
    <main style="display: flex; flex-direction: column; align-items: center; padding: 32px;">
        <div style="display: flex; align-items: center;">
            <img style="width: 50px; height: 50px; flex-shrink: 0; object-fit: cover;"
                src="https://th.bing.com/th/id/OIP.504ZOEY-quI4tFXyM-X0KgHaHa?pid=ImgDet&rs=1" alt="">
            <h2 style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin-left: 6px;">FOOD HUB</h2>
        </div>
        <h1 style="text-align: center; font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif; text-transform: uppercase;">Easy ordering, fast delivery</h1>
        <p style="text-align: justify; font-family: 'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif;">Hi,

            You are receiving this email because you requested to reset the password for your account on <b>FOOD HUB</b>. Please click the link below to reset your password:
            </p>
        <a href="${process.env.APP_URL}/forgot/reset/${email}?token=${emailToken}" style="background-color: rgb(124, 124, 239); border: none; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">SET PASSWORD</a>
        <p style="text-align: justify; font-family: 'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif;">
            If you did not request to reset your password, please ignore this email. If you have any issues, please contact us for assistance.
            Best regards, <br>
            <b>FOOD HUB </b>
        </p>
        <hr width="100%" style="margin-top: 24px;">
    </main>
</div>
        `)
            // <a href="${process.env.APP_URL}/forgot/reset/${email}?token=${emailToken}">Reset password</a>
            res.status(200).json({
                code: 'password/sendMail.success',
                message: 'we sent your email successfully',
                from: process.env.USERNAME_MAIL,
                to: email
            })
        } catch (error: any) {
            res.status(500).json({
                code: 'password/sendMail.error',

                error: error.message
            })
        }
    }

    //[GET] baseUrl/auth/password/:email
    reset(req: any, res: any) {
        try {
            const email: string = req.params.email.toLowerCase().trim();
            const newPassword: string = req.body.password.trim();
            const hashPassword: string = md5(newPassword);

            db.query('UPDATE user SET password= ? WHERE user.email = ?', ([hashPassword, email]), (err, result) => {
                if (err) throw err;
                if (result) {
                    res.status(200).json({
                        code: 'password/reset.success',
                        message: 'changed your password successfully'
                    })
                } else {
                    res.status(404).json({
                        code: 'password/reset.notFound',
                        message: 'email not found'
                    })
                }
            })
        } catch (error: any) {
            res.status(500).json({
                code: 'password/reset.error',

                error: error.message
            });
        }

    }

    //[POST] baseUrl/auth/social
    async socialSignIn(req: any, res: any) {
        try {
            const fullName: string = req.body.fullName.toLowerCase().trim();
            const email: string = req.body.email.toLowerCase().trim();
            const avatar: string = req.body.avatar.trim();
            const user = req.user;
            if (req.isExist) {
                res.status(200).json({
                    data: {
                        currentUser: user[0],
                        accessToken: JWTUntils.generateAccessToken(user[0]),
                        refreshToken: JWTUntils.generateRefreshToken(user[0])
                    }
                });
            } else {
                await db.promise().query("INSERT INTO user(fullName, email, avatar, type) VALUES (?, ?, ?, 1)", ([fullName, email, avatar]));

                db.query("SELECT id, avatar, fullName, email, phone, address FROM user WHERE email = ? AND type = 1", ([email]), (err: any, result: any) => {
                    if (err) throw err;
                    if (result.length) {
                        res.status(200).json({
                            data: {
                                currentUser: result[0],
                                accessToken: JWTUntils.generateAccessToken(result[0]),
                                refreshToken: JWTUntils.generateRefreshToken(result[0])
                            }
                        });
                    } else {
                        res.status(404).json({
                            code: 'auth/login.notFound',
                            message: 'email is not exist'
                        });
                    }
                });
            }
        } catch (error: any) {
            res.status(500).json({
                code: 'auth/login.error',
                error: error.message
            })
        }
    }
}

export default new AuthControlller;
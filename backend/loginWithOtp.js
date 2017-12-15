/**
 * Created by robins on 1/8/17.
 */
'use strict';
/*global module, require, return, console */
module.exports = function( server, databaseObj, helper, packageObj) {
    const Promise = require("bluebird");
    const SendOtp = require('sendotp');
    const _ = require('lodash');

    const addPasswordlessLogin = function (msg91Config) {
        const {method, requestOtp, retryOtp, enable, oneInstanceLogin} = msg91Config.login.mobile;
        console.log(method, requestOtp, retryOtp, enable, oneInstanceLogin);
        const message = msg91Config.credentials.defaultMessage || 'Otp for your request is {{otp}}, please do not share it with anybody';
        const sendOTP = new SendOtp(msg91Config.credentials.authKey, message);
        const expiryTime = msg91Config.credentials.expiryInMinutes || "2"; //by default it has been set up to 2
        //sendOTP.setOtpExpiry(expiryTime);

        if(enable){
            var User = databaseObj.User;
            /*
                var defaultError = new Error('login failed');
                defaultError.statusCode = 401;
                defaultError.code = 'LOGIN_FAILED';
            */
            User[requestOtp] = function(number, callback){
                requestOtpMethod(msg91Config, number, sendOTP)
                    .then(function () {
                        callback(null, {
                            status: "Success"
                        });
                    })
                    .catch(function (error) {
                        callback(error);
                    });
            };


            User[retryOtp] = function(number, callback){
                retryOtpMethod(msg91Config, number, sendOTP)
                    .then(function () {
                        callback(null, {
                            status: "Success"
                        });
                    })
                    .catch(function (error) {
                        callback(error);
                    });
            };

            User[method] = function(number, otp, callback){
                passwordLessMethod(msg91Config, number, otp, sendOTP, oneInstanceLogin)
                    .then(function (data) {
                        callback(null, data);
                    })
                    .catch(function (error) {
                        callback(error);
                    });
            };

            User.remoteMethod(
                requestOtp,
                {
                    description: 'Request an otp to request the OTP',
                    accepts: [
                        { arg: 'number', type: 'string', required: true}
                    ],
                    returns: {
                        arg: 'status', type: 'object', root: true,
                        description:"Return success or error"
                    },
                    http: {verb: 'post'}
                }

            );


            User.remoteMethod(
                retryOtp,
                {
                    description: 'Retry an otp',
                    accepts: [
                        { arg: 'number', type: 'string', required: true}
                    ],
                    returns: {
                        arg: 'status', type: 'object', root: true,
                        description:"Return success or error"
                    },
                    http: {verb: 'post'}
                }

            );


            User.remoteMethod(
                method,
                {
                    description: 'Login with an otp provided',
                    accepts: [
                        { arg: 'number', type: 'string', required: true},
                        { arg: 'otp', type: 'string', required: true}
                    ],
                    returns: {
                        arg: 'accessToken', type: 'object', root: true,
                        description:
                        'The response body contains properties of the AccessToken created on login.\n' +
                        'Depending on the value of `include` parameter, the body may contain ' +
                        'additional properties:\n\n' +
                        '  - `user` - `{User}` - Data of the currently logged in user. (`include=user`)\n\n'
                    },
                    http: {verb: 'post'}
                }

            );
        }
    };



    /**
     * Passwordless method for login.
     * @param msg91Config
     * @param number
     * @param otp
     * @param sendOTP
     */
    const passwordLessMethod = function(msg91Config, number, otp, sendOTP, oneInstanceLogin){
        return new Promise(function (resolve, reject) {
            if(number && otp){
                number = formatNumber(number);
                sendOTP.verify(number, otp, function (error, data, response) {
                    if(error){
                        reject(error);
                    }else if(data.type === 'success') {
                        var User = databaseObj.User;
                        createUserOrLogin(number, User, msg91Config, oneInstanceLogin)
                            .then(function (accessToken) {
                                resolve(accessToken);
                            })
                            .catch(function (error) {
                                reject(error);
                            });
                    }
                    else {
                        reject(new Error("OTP didnot match"));
                    }
                });
            }else{
                reject(new Error("Number and OTP is required"));
            }

        });
    };



    /**
     * Request an OTP
     * @param msg91Config
     * @param number
     * @param sendOTP
     */
    const retryOtpMethod = function(msg91Config, number, sendOTP){
        return new Promise(function (resolve, reject) {
            number = formatNumber(number);
            if(number){
                sendOTP.retry(number, false, function (error, data, response) {
                    if(error){
                        console.error(error);
                        reject(error);
                    }else{
                        resolve({
                            status: "Success"
                        });
                    }
                });
                /*sendOTP.send(number, msg91Config.credentials.serviceName, function (error, data, response) {
                    if(error){
                        console.error(error);
                        reject(error);
                    }else{
                        response({
                            status: "Success"
                        });
                    }
                });*/
            }else{
                reject(new Error("Number format not correct."));
            }
        });
    };



    /**
     * Send otp message to the user..
     * @param msg91Config
     * @param number
     * @param sendOTP
     */
    const requestOtpMethod = function(msg91Config, number, sendOTP){
        return new Promise(function (resolve, reject) {
            number = formatNumber(number);
            if(number){
                sendOTP.send(number, msg91Config.credentials.serviceName, function (error, data, response) {
                    if(error){
                        console.error(error);
                        reject(error);
                    }else{
                        resolve({
                            status: "Success"
                        });
                    }
                });
            }else{
                reject(new Error("Number format not correct."));
            }
        });
    };



    /**
     * Format indian number
     * @param number
     */
    const formatNumber = function (number) {
        //matching the number..
        var patt = /\+\d{12,12}/;
        //remove 0 from the number
        number = number.replace(/^0/, "");
        var match = number.match(patt);
        if (!match) {
            number = "+91" + number;
        }
        // //matching the number..
        // var patt = /\+\d{12,12}/;
        // //remove 0 from the number
        // number = number.replace(/^0/, "");
        // var match = number.match(patt);
        // if (!match) {
        //     number = "+91" + number;
        // }
        // //9953242338, +91-9953242338, +91-9953242338
        // const pattern = /^(\+91\-?)?\d{10,10}$/;
        // if(pattern.test(number)){
        //     number = _.replace(number, /^(\+91\-?)?/, '')
        // }
        return number;
    };



    //Create user or login user.....
    /**
     * Create a user if not availaible and then login user finally.
     * @param number  {Number} Number
     * @param User {Object} {Loopback User model}
     * @param msg91Config {{}}

     */
    var createUserOrLogin = function(number, User, msg91Config, oneInstanceLogin){
        return new Promise(function (resolve, reject) {
            var defaultError = new Error('login failed');
            defaultError.statusCode = 401;
            defaultError.code = 'LOGIN_FAILED';

            number = formatNumber(number);
            const password = packageObj.secretKey;
            const numberField = msg91Config.user.numberField;
            if(numberField){
                const query = {};
                query[numberField] = number.toString();
                User.findOne({where: query}, function (err, user){
                    if(err){
                        console.error(err);
                        reject(defaultError);
                    }else if(!user){
                        const data = {};
                        data[numberField] = number;
                        //console.log(userData);
                        data.password = password;

                        User.create(data, function(err, userObj) {
                            if(err){
                                console.error(err);
                                return reject(defaultError);
                            }else{
                                updateAccessTokenModel(userObj, oneInstanceLogin)
                                    .then(function (accessToken) {
                                        resolve(accessToken);
                                    })
                                    .catch(function (error) {
                                        reject(error);
                                    });
                            }
                        });
                    }
                    else{
                        if(user){
                            //Just provide login
                            updateAccessTokenModel(user)
                                .then(function (accessToken, oneInstanceLogin) {
                                    resolve(accessToken);
                                })
                                .catch(function (error) {
                                    reject(error);
                                });
                        }else{
                            reject(defaultError);
                        }
                    }
                });
            }else{
                reject(new Error("Number field is not found in config."));
            }


        });
    };




    /**
     * Update the user accessToken data
     * @param userInstance
     */
    var updateAccessTokenModel = function(userInstance, oneInstanceLogin){
        return new Promise(function (resolve, reject) {
            new Promise(function(resolve, reject){
                if(oneInstanceLogin){
                    console.log("Logout from all other devices.");
                    AccessToken = databaseObj.AccessToken;
                    AccessToken.destroyAll({
                        userId: userInstance.id
                    })
                    .then(function(){
                        console.log("Logout done.");
                        resolve();
                    })
                    .catch(function(error){
                        console.error("Logout rejected". error);
                        reject(error);
                    })
                }else{
                    console.log("oneInstanceLogin not activated");
                    resolve();
                }
            })
            .then(function(){
                userInstance.createAccessToken(31536000, function(error, token) {
                    if (error) {
                        console.error(error);
                        return reject(error);
                    }else{
                        token.__data.user = userInstance;
                        //console.log(token);
                        resolve(token);
                    }
                }); //createAccessToken
            })
            .catch(function(error){
                reject(error);
            });
        });
    };




    return {
        addPasswordlessLogin: addPasswordlessLogin
    }
};